var zlib = require('zlib');

var redis = require('redis');
var async = require('async');

var crypto = require('crypto');
var os = require('os');

var extPoolApi = require('./apiExt.js');

var algos = require('stratum-pool/lib/algoProperties.js');
var tools = require('./addtools.js');

module.exports = function(logger, portalConfig, poolConfigs){

    var _this = this;

    var logSystem = 'Stats';

    var redisClients = [];
    var redisStats;

    this.statHistory = [];
    this.statPoolHistory = [];

    this.stats = {};
    this.statsString = '';

    this.coinSetup = {coins: []};

    var extpool;

    setupStatsRedis();
    gatherStatHistory();

    var canDoStats = true;

    Object.keys(poolConfigs).forEach(function(coin){

        if (!canDoStats) return;

        var poolConfig = poolConfigs[coin];
        extpool = new extPoolApi(poolConfigs);

        var redisConfig = poolConfig.redis;

        for (var i = 0; i < redisClients.length; i++){
            var client = redisClients[i];
            if (client.client.port === redisConfig.port && client.client.host === redisConfig.host){
                client.coins.push(coin);
                return;
            }
        }
        redisClients.push({
            coins: [coin],
            client: redis.createClient(redisConfig.port, redisConfig.host)
        });
        var data = {
            coin:   coin,
            host:   poolConfigs[coin].stratumHost,
            ports:  [],
            algo:   poolConfigs[coin].coin.algorithm,
            symbol: poolConfigs[coin].coin.symbol
        };
        Object.keys(poolConfigs[coin].ports).forEach(function(port){
            var portdata = {
                port:   port,
                diff:   (typeof poolConfigs[coin].ports[port].difftype !== 'undefined' && poolConfigs[coin].ports[port].difftype === "external") ? 0 : poolConfigs[coin].ports[port].diff
            };
            data.ports.push(portdata);
        });
        _this.coinSetup.coins.push(data);
    });

    function setupStatsRedis(){
        redisStats = redis.createClient(portalConfig.redis.port, portalConfig.redis.host);
        redisStats.on('error', function(err){
            logger.error(logSystem, 'Historics', 'Redis for stats had an error ' + JSON.stringify(err));
        });
    }

    function gatherStatHistory(){

        var retentionTime = (((Date.now() / 1000) - portalConfig.website.stats.historicalRetention) | 0).toString();

        redisStats.zrangebyscore(['statHistory', retentionTime, '+inf'], function(err, replies){
            if (err) {
                logger.error(logSystem, 'Historics', 'Error when trying to grab historical stats ' + JSON.stringify(err));
                return;
            }
            for (var i = 0; i < replies.length; i++){
                _this.statHistory.push(JSON.parse(replies[i]));
            }
            _this.statHistory = _this.statHistory.sort(function(a, b){
                return a.time - b.time;
            });
            _this.statHistory.forEach(function(stats){
                addStatPoolHistory(stats);
            });
        });
    }

    function addStatPoolHistory(stats){
        var data = {
            time: stats.time,
            pools: {}
        };
        for (var pool in stats.pools){
            data.pools[pool] = {
                hashrate: stats.pools[pool].hashrate,
                workerCount: stats.pools[pool].workerCount,
                blocks: stats.pools[pool].blocks,
                shares: stats.pools[pool].shares
            }
        }
        _this.statPoolHistory.push(data);
    }




    this.getGlobalStats = function(callback){

        var statGatherTime = Date.now() / 1000 | 0;

        var allCoinStats = {};

        async.each(redisClients, function(client, callback){
            var windowTime = (((Date.now() / 1000) - portalConfig.website.stats.hashrateWindow) | 0).toString();
            var redisCommands = [];


            var redisCommandTemplates = [
                ['zremrangebyscore', ':hashrate', '-inf', '(' + windowTime],
                ['zrangebyscore', ':hashrate', windowTime, '+inf'],
                ['hgetall', ':stats'],
                ['scard', ':blocksPending'],
                ['scard', ':blocksConfirmed'],
                ['scard', ':blocksOrphaned'],
                ['hvals', ':payouts']
            ];

            var commandsPerCoin = redisCommandTemplates.length;

            client.coins.map(function(coin){
                redisCommandTemplates.map(function(t){
                    var clonedTemplates = t.slice(0);
                    clonedTemplates[1] = coin + clonedTemplates[1];
                    redisCommands.push(clonedTemplates);
                });
            });


            client.client.multi(redisCommands).exec(function(err, replies){
                if (err){
                    logger.error(logSystem, 'Global', 'error with getting global stats ' + JSON.stringify(err));
                    callback(err);
                }
                else{
                    for(var i = 0; i < replies.length; i += commandsPerCoin){
                        var coinName = client.coins[i / commandsPerCoin | 0];
                        var coinStats = {
                            name: coinName,
                            symbol: poolConfigs[coinName].coin.symbol.toUpperCase(),
                            algorithm: poolConfigs[coinName].coin.algorithm,
                            hashrates: replies[i + 1],
                            poolStats: {
                                validShares: replies[i + 2] ? (replies[i + 2].validShares || 0) : 0,
                                validBlocks: replies[i + 2] ? (replies[i + 2].validBlocks || 0) : 0,
                                invalidShares: replies[i + 2] ? (replies[i + 2].invalidShares || 0) : 0,
                                totalPaid: replies[i + 2] ? (replies[i + 2].totalPaid || 0) : 0
                            },
                            blocks: {
                                pending: replies[i + 3],
                                confirmed: replies[i + 4],
                                orphaned: replies[i + 5]
                            },
                            payouts: replies[i + 6]
                        };
                        allCoinStats[coinStats.name] = (coinStats);
                    }
                    callback();
                }
            });
        }, function(err){
            if (err){
                logger.error(logSystem, 'Global', 'error getting all stats' + JSON.stringify(err));
                callback();
                return;
            }

            var portalStats = {
                time: statGatherTime,
                global:{
                    workers: 0,
                    hashrate: 0,
                    payouts: 0
                },
                algos: {},
                pools: allCoinStats
            };

            var workerstats=[];

            Object.keys(allCoinStats).forEach(function(coin){
                var coinStats = allCoinStats[coin];
                coinStats.workers = {};
                coinStats.shares = 0;
                coinStats.hashrates.forEach(function(ins){
                    var parts = ins.split(':');
                    var workerShares = parseFloat(parts[0]);
                    var worker = parts[1];
                    if (workerShares > 0) {
                        coinStats.shares += workerShares;
                        if (worker in coinStats.workers)
                            coinStats.workers[worker].shares += workerShares;
                        else
                            coinStats.workers[worker] = {
                                shares: workerShares,
                                invalidshares: 0,
                                hashrateString: null
                            };
                    }
                    else {
                        if (worker in coinStats.workers)
                            coinStats.workers[worker].invalidshares -= workerShares; // workerShares is negative number!
                        else
                            coinStats.workers[worker] = {
                                shares: 0,
                                invalidshares: -workerShares,
                                hashrateString: null
                            };
                    }
                });
                coinStats.payouts.forEach(function(pout){
                    portalStats.global.payouts += parseFloat(pout);
                });

                var shareMultiplier = Math.pow(2, 32) / algos[coinStats.algorithm].multiplier;
                coinStats.hashrate = shareMultiplier * coinStats.shares / portalConfig.website.stats.hashrateWindow;
//                coinStats.difficulyy = shares;

                coinStats.workerCount = Object.keys(coinStats.workers).length;
                portalStats.global.workers += coinStats.workerCount;

                /* algorithm specific global stats */
                var algo = coinStats.algorithm;
                if (!portalStats.algos.hasOwnProperty(algo)){
                    portalStats.algos[algo] = {
                        workers: 0,
                        hashrate: 0,
                        hashrateString: null
                    };
                }
                portalStats.algos[algo].hashrate += coinStats.hashrate;
                portalStats.algos[algo].workers += Object.keys(coinStats.workers).length;
                portalStats.global.hashrate += coinStats.hashrate;

                for (var worker in coinStats.workers) {
                    var hshares = shareMultiplier * coinStats.workers[worker].shares;
                    var hrate = shareMultiplier * coinStats.workers[worker].shares / portalConfig.website.stats.hashrateWindow;
                    var hratestring = _this.getReadableHashRateString(hrate);
                    coinStats.workers[worker].hashrateString = hratestring;
                    workerstats.push(['zadd', coin + ":workerStat:" + worker, statGatherTime, JSON.stringify({time: statGatherTime, hashrate:hrate, hashratestring:hratestring, shares : hshares })]);
                    workerstats.push(['zremrangebyscore', coin + ":workerStat:" + worker, '-inf', '(' + retentionTime]);
                }

                delete coinStats.hashrates;
//                delete coinStats.shares;

                coinStats.hashrateString = _this.getReadableHashRateString(coinStats.hashrate);
            });

            redisStats.multi(workerstats).exec(function(err, replies){
                if (err)
                    logger.error(logSystem, 'Historics', 'Error adding stats to historics ' + JSON.stringify(err));
            });

            Object.keys(portalStats.algos).forEach(function(algo){
                var algoStats = portalStats.algos[algo];
                algoStats.hashrateString = _this.getReadableHashRateString(algoStats.hashrate);
            });

            portalStats.global.hours = Math.floor((Date.now()-new Date(2017,1,1).getTime())/(60*60*1000))
            portalStats.global.hashrateString = _this.getReadableHashRateString(portalStats.global.hashrate);
            portalStats.global.payouts = Math.floor(Math.round(portalStats.global.payouts * 100))/100
            _this.stats = portalStats;
            _this.statsString = JSON.stringify(portalStats);



            _this.statHistory.push(portalStats);
            addStatPoolHistory(portalStats);

            var retentionTime = (((Date.now() / 1000) - portalConfig.website.stats.historicalRetention) | 0);

            for (var i = 0; i < _this.statHistory.length; i++){
                if (retentionTime < _this.statHistory[i].time){
                    if (i > 0) {
                        _this.statHistory = _this.statHistory.slice(i);
                        _this.statPoolHistory = _this.statPoolHistory.slice(i);
                    }
                    break;
                }
            }

            redisStats.multi([
                ['zadd', 'statHistory', statGatherTime, _this.statsString],
                ['zremrangebyscore', 'statHistory', '-inf', '(' + retentionTime]
            ]).exec(function(err, replies){
                if (err)
                    logger.error(logSystem, 'Historics', 'Error adding stats to historics ' + JSON.stringify(err));
            });
            callback();
        });

    };

    this.getReadableHashRateString = function(hashrate){
        var i = -1;
        var byteUnits = [ ' KH', ' MH', ' GH', ' TH', ' PH' ];
        do {
            hashrate = hashrate / 1000;
            i++;
        } while (hashrate > 1000);
        return hashrate.toFixed(2) + byteUnits[i];
    };


    this.getPayoutStats = function(coin, callback){
        var redisCommandTemplates = [
            ['hgetall', coin+':payouts'],
        ];

        redisStats.multi(redisCommandTemplates).exec(function( err, results)
        {
            callback(err,  results[0] );
        });
    };

    this.getLiveStats = function(callback){
        var redisCommandTemplates = [
            ['hgetall', 'summary:liveStat']
        ];

        redisStats.multi(redisCommandTemplates).exec(function( err, results )
        {
            callback(err,  results[0] );
        });
    };

    this.getUserLiveStats = function(user, callback){

        var windowTime = (((Date.now() / 1000) - portalConfig.website.stats.hashrateWindow) | 0).toString();

        redisStats.hscan("summary:liveStat",0 , 'match', user +"*",  'count', '1000', function(err, results){

            var q= new Object();
            if (results[1].length > 1)
                for( var a = 0; a < results[1].length; a += 2) {

                    var tmpresult = JSON.parse(results[1][a+1]);
                    tmpresult.Hash = crypto.createHmac('sha256', results[1][a]).digest('hex');
                    q[results[1][a]] = JSON.stringify(tmpresult);
                }

            callback({error:err,  result :  q, coins: _this.coinSetup.coins.map(function (obj) { return obj.coin })} );
        });
    };

    this.setWorkerIPLiveStats = function(coin, worker, time, stat, callback){
        if(worker.length === 0){
            callback({error:"No stat. No worker error.",  result :  null});
            return;
        }
        redisStats.hscan(coin + ":liveStat", 0 , 'match', worker+"*",  'count', '1000', function(err, results) {
            if (err || results == null) {
                callback({error: "No stat. Redis request error.", result: null});
                return;
            }
            if (results[1].length > 1){
                for (var a = 0; a < results[1].length; a += 2) {

                    var userstat = JSON.parse(results[1][a + 1]);
                    if (worker === userstat.Name)
                    {
                        userstat.Stat = stat;
                        if (time) userstat.Time = time;
                        redisStats.hset(coin + ":liveStat", results[1][a], JSON.stringify(userstat), function (err, results) {});
                        callback({error:null,  result :  true});
                        return;
                    }
                }
                callback({error:"No stat. No worker error.",  result :  null});
                return;
            }else{
                callback({error:"No stat. No worker error.",  result :  null});
                return;
            }
        });
    };

    this.regWorkerLiveStats = function(coin, client, clienthash, callback){
        redisStats.hget( coin + ':liveStat', client.label, function(err, result) {
            if( !err && result  )
            {
                var curstat = JSON.parse(result);
                client.stat = curstat.Stat;
                client.avgStat = curstat.avgStat;
                client.warningtimes = curstat.warningtimes;
            }
            redisStats.hset(coin + ':liveStat', client.label,
                JSON.stringify({
                    'Name': client.workerName,
                    "IP": client.remoteAddress,
                    "Time": client.lastActivity,
                    "Stat": client.stat,
                    "avgStat": client.avgStat,
                    "warningtimes": client.warningtimes
                })
            );
            redisStats.zadd(coin + ':liveStat:' + clienthash, Math.floor(Date.now() / 1000),
                JSON.stringify({
                    'Name': client.workerName,
                    "IP": client.remoteAddress,
                    "Time": client.lastActivity,
                    "Stat": client.stat
                })
            );
            callback({err:null,  result :  true});
        });
    };

    this.getUserHistoryStats = function(user, callback) {
        var windowTime = (((Date.now() / 1000) - portalConfig.website.stats.hashrateWindow * 30) | 0).toString();
        //aggregate all coins in one statistic
        var farmmask = "*:workerStat:" + user + "*";
        redisStats.keys(farmmask, function (err, results) {
            var q = new Object();
            var rdone = 0;

            var totalhashrate = new Object();
            var totalshares = new Object();


            var getstat = function (x) {
                redisStats.zremrangebyscore(results[x], '-inf', '(' + windowTime, function (err, result1) {
                    redisStats.zrangebyscore(results[x], windowTime, '+inf', function (err, result) {
//                        var curdata = JSON.parse(result);
                        result.forEach(function (qx) {
                            var x = JSON.parse(qx);

                            if (typeof x.time != 'undefined') {
                                if (typeof totalhashrate[x.time] == 'undefined') totalhashrate[x.time] = {Time: x.time * 1000,hashrate: 0,shares: 0};
                                totalhashrate[x.time].hashrate += x.hashrate;
                                totalhashrate[x.time].shares += x.shares;
                            }
                        });
                        if (x + 1 < results.length) getstat(x + 1); else
                            callback({error: null, result: totalhashrate});
                    });
                });
            };
            if (results.length > 0) getstat(0);
        });
    };

    this.getConnectionLiveStats = function(digest, callback){
        var windowTime = (((Date.now() / 1000) - portalConfig.website.stats.hashrateWindow * 30) | 0).toString();

        var clienthash = digest;

        var farmmask = "*:liveStat:" + clienthash;
        redisStats.keys(farmmask, function (err, results) {
            var resultArray = [];
            var getstat = function (x) {
                redisStats.zrangebyscore(results[x], windowTime, "+Inf", function (err, result) {
                    resultArray = resultArray.concat(result);
                    if (x + 1 < results.length) getstat(x + 1);
                    else callback(resultArray);
                });
            };
            if (results.length > 0) getstat(0);
        });
    };


    this.registerUser = function(login, password, refcode, callback){
        redisStats.hget("users", login, function(err, result)
        {
            if(err || result ) {
                return callback({result:null, error:"User already registered"});
            } else {
                redisStats.hset("users", login, JSON.stringify({password:tools.hidePwd(password)}));
            }
            callback({result:true, error:null});
        });
    };

    this.loginUser = function(login, password, confcode, callback){
        redisStats.hget("users", login, function(err, result)
        {
            if( err || !result){
                callback({result:null, error:"No such user", conf:false});
                return;
            }
            var userdata = JSON.parse(result);
            if( typeof userdata.password === 'undefined' || tools.hidePwd(password) !== userdata.password) {
                callback({result:null, error:"Incorrect password", conf:false});
                return;
            }
            if (confcode === 'wo') {
                callback({result: true, error: null, conf:false});
                return;
            }
            redisStats.hget("users:settings:"+login, "tfauth", function(err, result){
                if (err){
                    callback({result:null, error:"Db error", conf:false});
                    return;
                }
                var confirmed = false;
                switch(result || "none"){
                    case 'telegram': {
                        if ( confcode === 'new' || typeof userdata.lConfirmationSendTime === 'undefined' || Date.now() - userdata.lConfirmationSendTime > 2 * 60 * 1000 ) {
                            userdata.lConfirmationSendTime = Date.now();
                            redisStats.hset("users:confCodes:"+login, userdata.lConfirmationSendTime+':0', JSON.stringify({"code":tools.generateCode()}), function(err, result){
                                redisStats.hset("users", login, JSON.stringify(userdata));
                            });
                            callback({result: null, error: "New confirmation code sending to yours telegram", conf:true});
                            return;
                        } else {
                            redisStats.hget("users:confCodes:"+login, userdata.lConfirmationSendTime+':1', function(err, result){
                                if ( err || !result ){
                                    callback({result: null, error: "Wrong confirmation code", conf:true});
                                    return;
                                }
                                var code = JSON.parse(result).code;
                                if (code !== confcode) {
                                    callback({result: null, error: "Wrong confirmation code", conf:true});
                                    return;
                                } else {
                                    userdata.lConfirmationSendTime = 0;
                                    redisStats.hset("users", login, JSON.stringify(userdata));

                                    callback({result: true, error: null, conf:true});
                                    return;
                                }
                            })
                        }
                        break;
                    }
                    case 'none': {
                        confirmed = true;
                        break;
                    }
                    default: {
                        callback({result:null, error:"Db error", conf:false});
                        return;
                    }
                }
                if (confirmed){
                    callback({result: true, error: null, conf:false});
                }
            });
        });
    };

    this.getUserInfo = function(login, password, callback){
        redisStats.hget("users", login, function(err, result)
        {
            if( err || !result){
                callback({result:null, error:"No such user"});
                return;
            }
            var userdata = JSON.parse(result);
            if( typeof userdata.password === 'undefined' || password !== userdata.password) {
                callback({result:null, error:"Incorrect password"});
                return;
            }
            redisStats.hgetall("users:settings:"+login, function(err, result){
                callback({result:{name:login, wallets:userdata.wallets, telegram:userdata.telegram, settings:result, refcode:''}, error:null});
            });
        });
    };

    this.getTelegramUsers = function(callback){
        redisStats.hgetall("users", function(err, result)
        {
            if( err || !result){
                callback(null, "No such users");
                return;
            }
            var telegramUsers=[];
            for( var r in result )
            {
                var userdata = JSON.parse(result[r]);
                if( typeof userdata.telegram !== 'undefined' )
                {
                    userdata.name = r;
                    telegramUsers.push({name:r,userdata:userdata});
                }
            }

            callback(telegramUsers, null);
        });
    };

    this.getUserTelegram = function(clientname, callback) {
        redisStats.hget("users", clientname, function (err, result) {
            if( err || !result){
                callback(null, "No such users");
                return;
            }
            var userdata = JSON.parse(result);
            if( typeof userdata.telegram === 'undefined' ){
                callback(null, "Unregistered telegram");
                return;
            }

            callback({telegram:userdata.telegram}, null);
        });
    };

    this.getUserBalance = function( login, password, callback){
        redisStats.hget("users", login, function (err, result) {
            if (err || !result) {
                callback({result: null, error: "No such user",});
                return;
            }
            var userdata = JSON.parse(result);
            if (typeof userdata.password == 'undefined' || password != userdata.password) {
                callback({result: null, error: "Incorrect password"});
                return;
            }
            var balances = {};
            async.each(Object.keys(poolConfigs), function (coin, asyncCallback) {
                async.waterfall([
                    function(callback){
                        extpool.getBalance(coin, function(err, result) {
                            if( err !== null ) return callback(err);
                            else callback(null, result.data)
                        });
                    }, function (poolbalance, callback) {
                        var totalshares = 0;
                        var usershares = 0;
                        var userbalance = 0;
                        redisStats.hgetall( coin + ":shares:roundCurrent", function(err, result){
                            if (err) callback(err);
                            for( var r in result )
                            {
                                if( login == r.substr(0, login.length ) )
                                {
                                    usershares += parseFloat(result[r]);
                                }
                                totalshares += parseFloat(result[r]);
                            }
                            if( totalshares > 0 ) userbalance = poolbalance * (usershares/ totalshares);
                            balances[coin] = {balance:userbalance,sym:poolConfigs[coin].coin.symbol};

                            callback(null);
                        });
                    }, function (callback) {
                        redisStats.hget( coin + ":payments:pending", login, function(err, result){
                            if (err) callback(err);

                            if (result) balances[coin].balance += parseFloat(result);

                            callback();
                        });
                    }, function (callback) {
                        redisStats.hget( coin + ":balances", login, function(err, result){
                            if (err) callback(err);

                            if (result) balances[coin].balance += parseFloat(result);

                            callback();
                        });
                    }
                ], function(err){
                    asyncCallback(err);
                });
            }, function (err, result) {
                callback({result: !err ? {balance: balances} : null, error: err});
            });
        });
    };

    this.addWallet = function(login, password, wallets, settings, confcode, callback){
        redisStats.hget("users", login, function(err, result)
        {
            if( err || !result ){
                callback({result:null, error:"No such user", conf:false});
                return;
            }
            var userdata = JSON.parse(result);
            if( typeof userdata.password == 'undefined' || password != userdata.password) {
                callback({result:null, error:"Incorrect password", conf:false});
                return;
            }
            redisStats.hget("users:settings:"+login, "tfauth", function(err, result){
                if (err){
                    callback({result:null, error:"Db error", conf:false});
                    return;
                }
                var confirmed = false;
                switch(result || "none"){
                    case 'telegram': {
                        if ( confcode === 'new' || typeof userdata.wConfirmationSendTime === 'undefined' || Date.now() - userdata.wConfirmationSendTime > 2 * 60 * 1000 ) {
                            userdata.wConfirmationSendTime = Date.now();
                            redisStats.hset("users:confCodes:"+login, userdata.wConfirmationSendTime+':0', JSON.stringify({"code":tools.generateCode()}), function(err, result){
                                redisStats.hset("users", login, JSON.stringify(userdata));
                            });
                            callback({result: null, error: "New confirmation code sending to yours telegram", conf:true});
                            return;
                        } else {
                            redisStats.hget("users:confCodes:"+login, userdata.wConfirmationSendTime+':1', function(err, result){
                                if ( err || !result ){
                                    callback({result: null, error: "Wrong confirmation code", conf:true});
                                    return;
                                }
                                var code = JSON.parse(result).code;
                                if (code !== confcode) {
                                    callback({result: null, error: "Wrong confirmation code", conf:true});
                                    return;
                                } else {
                                    userdata.wConfirmationSendTime = 0;
                                    if (typeof userdata.wallets === 'undefined') userdata.wallets = new Object();
                                    userdata.wallets = wallets;

                                    redisStats.hset("users", login, JSON.stringify(userdata));
                                    Object.keys(settings).forEach(function(coin) {
                                        redisStats.hset("users:settings:"+login, "minpayments_"+coin.replace(/\s/gi,''), parseFloat(settings[coin].replace(/,/gi,'.')) || 0.01);
                                    });

                                    callback({result: true, error: null, conf:true});
                                    return;
                                }
                            })
                        }
                        break;
                    }
                    case 'none': {
                        confirmed = true;
                        break;
                    }
                    default: {
                        callback({result:null, error:"Db error", conf:false});
                        return;
                    }
                }
                if (confirmed){
                    if (typeof userdata.wallets === 'undefined') userdata.wallets = new Object();
                    userdata.wallets = wallets;

                    redisStats.hset("users", login, JSON.stringify(userdata));
                    Object.keys(settings).forEach(function(coin) {
                        redisStats.hset("users:settings:"+login, "minpayments_"+coin.replace(/\s/gi,''), parseFloat(settings[coin].replace(/,/gi,'.')) || 0.01);
                    });

                    callback({result: true, error: null, conf:false});
                }
            });
        });
    };

    this.addTelegram = function(login, password, telegram, callback){
        redisStats.hget("users", login, function(err, result)
        {
            if( err || !result){
                callback({result:null, error:"No such user", });
                return;
            }
            var userdata = JSON.parse(result);
            if( typeof userdata.password == 'undefined' || password != userdata.password) {
                callback({result:null, error:"Incorrect password", });
                return;
            }

            userdata.telegram = telegram;

            redisStats.hset("users", login, JSON.stringify(userdata) );

            callback({result:true, error:null});
        });
    };

    this.getUserFarms = function(login, password, farmName, callback){
        redisStats.hget("users", login, function(err, result)
        {
            if( err || !result){
                callback({dataArray:null, error:"No such user"});
                return;
            }
            var userdata = JSON.parse(result);
            if( typeof userdata.password === 'undefined' || password !== userdata.password) {
                callback({dataArray:null, error:"Incorrect password"});
                return;
            }

            redisStats.hscan("summary:liveStat", 0 , 'match', login +"*",  'count', '100', function(err, results){
                var dataArray = [];
                for (index = 1; index < results[1].length; index += 2) {
                    var farmData = JSON.parse(results[1][index]);
                    dataArray.push(farmData.Name.substr(farmData.Name.indexOf("/")+1,farmData.Name.length));
                }
                callback({dataArray:dataArray, error:null});
            });
        });
    };

    this.getFarmlist = function(callback){
        redisStats.hscan("summary:liveStat", 0 , 'match', "*",  'count', '1000', function(err, results){
            var dataArray = [];
            for (index = 1; index < results[1].length; index += 2) {
                var farmData = JSON.parse(results[1][index]);
                dataArray.push(tools.parseName(farmData.Name));
            }
            callback({dataArray:dataArray, error:null});
        });
    };

    this.addSysMessage = function(username, worker, message, callback){
        redisStats.zscan('users:messages:'+username, 0, 'match', worker+'::'+message+'::0', 'count', '100', function(err, results){
            if (results[1].length>1){
                callback("Already in the queue.");
                return;
            }
            redisStats.zadd('users:messages:' + username, Math.floor(Date.now() / 1000), [worker,message,0].join('::'), function(err, results) {
                callback("Your command will be completing soon");
            });
        })
    };

    this.getNewMessages = function(login, callback){
        var minerData = tools.parseName(login || '');
        redisStats.zscan('users:messages:'+minerData[0], 0, 'match', minerData[1]+'::*::0', 'count', '1000', function(err, results){
            if (results[1].length===0){
                callback({messages:[], login:login});
                return;
            } else {
                var messageArray = [];
                for (index = 0; index < results[1].length; index += 2) {
                    var message = JSON.parse(results[1][index].split('::')[1]);
                    var time = results[1][index+1];
                    messageArray.push(message);
                    redisStats.zrem('users:messages:' + minerData[0], [minerData[1], JSON.stringify(message), 0].join('::'), function (err, res) {
                        redisStats.zadd('users:messages:' + minerData[0], time, [minerData[1], JSON.stringify(message), Math.floor(Date.now() / 1000)].join('::'), function (err, results) {
                        });
                    });
                }
                callback({messages:messageArray, login:login});
            }
        })
    };

    this.loginAdmin = function(login, password, callback){
        redisStats.hget("admins", login, function(err, result)
        {
            if( err || !result){
                callback({result:null, error:"No such admin"});
                return;
            }
            var admindata = JSON.parse(result);
            if( typeof admindata.password === 'undefined' || tools.hidePwd(password) !== admindata.password) {
                callback({result:null, error:"Incorrect password"});
                return;
            }
            callback({result: true, error: null});
        });
    };

    this.setAdminTelegram = function(login, password, telegram, callback){
        redisStats.hget("admins", login, function(err, result)
        {
            if( err || !result){
                callback({result:null, error:"No such admin"});
                return;
            }
            var admindata = JSON.parse(result);
            if( typeof admindata.password === 'undefined' || tools.hidePwd(password) !== admindata.password) {
                callback({result:null, error:"Incorrect password"});
                return;
            }

            admindata.telegram = telegram;

            redisStats.hset("admins", login, JSON.stringify(admindata) );

            callback({result:true, error:null});
        });
    };

    this.getAdminTelegrams = function(callback){
        redisStats.hgetall("admins", function(err, result)
        {
            if( err || !result){
                callback(null, "No such admins");
                return;
            }
            var telegramAdmins=[];
            for( var r in result )
            {
                var userdata = JSON.parse(result[r]);
                if( typeof userdata.telegram != 'undefined' )
                {
                    telegramAdmins.push(userdata.telegram);
                }
            }

            callback(telegramAdmins, null);
        });
    };

    this.getNewConfirmationCodes = function(userdata, callback){
        var username = userdata.name;
        redisStats.hscan("users:confCodes:"+username, 0 , 'match', "*:0",  'count', '1000', function(err, results)
        {
            if( err || !results){
                callback([]);
                return;
            }

            var codes = [];
            for (index = 1; index < results[1].length; index += 2) {
                var key = results[1][index-1];
                var value = JSON.parse(results[1][index]);
                codes.push(value.code);
                redisStats.hdel("users:confCodes:"+username, key);
                redisStats.hset("users:confCodes:"+username, key.split(':')[0]+':1', JSON.stringify(value) );
            }

            callback(codes);
        });
    };

    this.checkCoinSwitchAccess = function(login, password, names, coin, callback){
        redisStats.hget("users", login, function(err, result)
        {
            if( err || !result){
                return callback(false);
            }
            var userdata = JSON.parse(result);
            if( typeof userdata.password === 'undefined' || password !== userdata.password) {
                return callback(false);
            }
            if (login !== names[0]) return callback(false);

            redisStats.hscan("summary:liveStat", 0 , 'match', login +"*",  'count', '100', function(err, results){
                for (index = 1; index < results[1].length; index += 2) {
                    var farmData = JSON.parse(results[1][index]);
                    if (farmData.Name.substr(farmData.Name.indexOf("/")+1,farmData.Name.length) === names[1] && farmData.curcoin !== coin) return callback(true);
                }
                return callback(false);
            });
        });
    };

    this.checkBaseCommandAccess = function(login, password, names, callback){
        redisStats.hget("users", login, function(err, result)
        {
            if( err || !result){
                return callback(false);
            }
            var userdata = JSON.parse(result);
            if( typeof userdata.password === 'undefined' || password !== userdata.password) {
                return callback(false);
            }
            if (login !== names[0]) return callback(false);

            redisStats.hscan("summary:liveStat", 0 , 'match', login +"*",  'count', '100', function(err, results){
                for (index = 1; index < results[1].length; index += 2) {
                    var farmData = JSON.parse(results[1][index]);
                    if (farmData.Name.substr(farmData.Name.indexOf("/")+1,farmData.Name.length) === names[1]) return callback(true);
                }
                return callback(false);
            });
        });
    };

    this.getUserPayouts = function(login, password, coin, callback){
        redisStats.hget("users", login, function(err, result)
        {
            if( err || !result){
                return callback({error:"No user",dataArray:null});
            }
            var userdata = JSON.parse(result);
            if( typeof userdata.password === 'undefined' || password !== userdata.password) {
                return callback({error:"Access error",dataArray:null});
            }

            redisStats.hvals(coin+":payouts:done:"+login, function(err, results){
                var dataArray = [];
                for (var trans in results){
                    var parsedtrans = JSON.parse(results[trans]);
                    parsedtrans.coin = coin;
                    dataArray.push(parsedtrans);
                }
                return callback({error:null,dataArray:dataArray});
            });
        });
    };

    this.updateUserSettings = function(login, password, settings, confcode, callback){
        redisStats.hget("users", login, function(err, result)
        {
            if( err || !result ){
                callback({result:null, error:"No such user", conf:false});
                return;
            }
            var userdata = JSON.parse(result);
            if( typeof userdata.password === 'undefined' || password !== userdata.password) {
                callback({result:null, error:"Incorrect password", conf:false});
                return;
            }
            if( settings['tfauth'] !== 'none' && typeof userdata.telegram === 'undefined') {
                callback({result:null, error:"Telegram is not connected", conf:false});
                return;
            }
            redisStats.hget("users:settings:"+login, "tfauth", function(err, result){
                if (err){
                    callback({result:null, error:"Db error", conf:false});
                    return;
                }
                var confirmed = false;
                switch(result || "none"){
                    case 'telegram': {
                        if ( confcode === 'new' || typeof userdata.sConfirmationSendTime === 'undefined' || Date.now() - userdata.sConfirmationSendTime > 2 * 60 * 1000 ) {
                            userdata.sConfirmationSendTime = Date.now();
                            redisStats.hset("users:confCodes:"+login, userdata.sConfirmationSendTime+':0', JSON.stringify({"code":tools.generateCode()}), function(err, result){
                                redisStats.hset("users", login, JSON.stringify(userdata));
                            });
                            callback({result: null, error: "New confirmation code sending to yours telegram", conf:true});
                            return;
                        } else {
                            redisStats.hget("users:confCodes:"+login, userdata.sConfirmationSendTime+':1', function(err, result){
                                if ( err || !result ){
                                    callback({result: null, error: "Wrong confirmation code", conf:true});
                                    return;
                                }
                                var code = JSON.parse(result).code;
                                if (code !== confcode) {
                                    callback({result: null, error: "Wrong confirmation code", conf:true});
                                    return;
                                } else {
                                    userdata.sConfirmationSendTime = 0;

                                    redisStats.hset("users", login, JSON.stringify(userdata));
                                    Object.keys(settings).forEach(function(parameter){
                                        redisStats.hset("users:settings:"+login, parameter, settings[parameter]);
                                    });
                                    callback({result: true, error: null, conf:true});
                                    return;
                                }
                            })
                        }
                        break;
                    }
                    case 'none': {
                        confirmed = true;
                        break;
                    }
                    default: {
                        callback({result:null, error:"Db error", conf:false});
                        return;
                    }
                }
                if (confirmed){
                    Object.keys(settings).forEach(function(parameter){
                        redisStats.hset("users:settings:"+login, parameter, settings[parameter]);
                    });
                    callback({result: true, error: null, conf:false});
                }
            });
        });
    };

    this.getUserLastPayouts = function( login, password, callback){
        redisStats.hget("users", login, function (err, result) {
            if (err || !result) {
                callback({error:"No user",dataArray:null});
                return;
            }
            var userdata = JSON.parse(result);
            if (typeof userdata.password === 'undefined' || password !== userdata.password) {
                callback({error:"Access error",dataArray:null});
                return;
            }
            var payouts = {};
            async.waterfall([
                function(waterfallcallback){
                    async.each(Object.keys(poolConfigs), function (coin, asyncCallback) {
                        redisStats.hvals(coin+":payouts:done:"+login, function(err, results){
                            payouts[coin] = results;
                            asyncCallback(err)
                        });
                    }, function (err, result) {
                        waterfallcallback(null)
                    });
                }, function (waterfallcallback) {
                    //form response
                    var result = [];
                    var latestTimeIndex = 0;
                    Object.keys(payouts).forEach(function(coin){
                        for (var trans in payouts[coin]){
                            var parsedtrans = JSON.parse(payouts[coin][trans]);
                            parsedtrans.coin = coin;
                            if (result.length < 5){
                                result.push(parsedtrans);
                                if (result.length === 5 ) latestTimeIndex = tools.getMaxTimeIndex(result);
                            } else if (parsedtrans.time > result[latestTimeIndex].time){
                                result[latestTimeIndex] = parsedtrans;
                                latestTimeIndex = tools.getMaxTimeIndex(result);
                            }
                        }
                    });
                    result.sort(tools.objTimeSortFN);
                    waterfallcallback(null,result)
                }
            ], function(err,results){
                callback({error:null,dataArray:results});
            });
        });
    };

    this.getUsers = function(username, callback){
        callback({dataArray:[], error:"Unsupported method"});
        return;
    };

    this.getUser = function(uname, callback){
        callback({user:null, error:"Unsupported method"});
        return;
    };

    this.addPayoff = function(uname, recipient, percent, subject, callback){
        callback(null, {result:false, error:"Unsupported method"});
        return;
    };

    this.deletePayoff = function(uname, recipient, callback){
        callback(null, {result:false, error:"Unsupported method"});
        return;
    };

    this.dumpHistory = function(){
        var retentionTime = (((Date.now() / 1000) - portalConfig.website.stats.historicalRetention) | 0).toString();
        redisStats.keys("*:liveStat:*", function (err, results) {
            var clearstat = function (x) {
                redisStats.zremrangebyscore(results[x], "-Inf", "(" + retentionTime, function (err, result) {
                    if (x + 1 < results.length) clearstat(x + 1);
                });
            };
            if (results.length > 0) clearstat(0);
        });
    }
};