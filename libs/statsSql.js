var zlib = require('zlib');

var redis = require('redis');
var async = require('async');

var crypto = require('crypto');
var os = require('os');

var extPoolApi = require('./apiExt.js');

var algos = require('stratum-pool/lib/algoProperties.js');
var tools = require('./addtools.js');
var models  = require('../models');

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

            portalStats.global.hours = Math.floor((Date.now()-new Date(2017,8,18).getTime())/(60*60*1000));
            portalStats.global.hashrateString = _this.getReadableHashRateString(portalStats.global.hashrate);
            portalStats.global.payouts = Math.floor(Math.round(portalStats.global.payouts * 100))/100;
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
            ['hgetall', coin+':payouts']
        ];

        redisStats.multi(redisCommandTemplates).exec(function( err, results)
        {
            callback(err,  results[0] );
        });
    };

    this.getLiveStats = function(callback){
        models.Farm.findAll({include: [ 'Stat' ]}).then( farms => {
            var result = {};
            farms.forEach(function(farm) {
                result[farm.name] = JSON.stringify({
                    Name: farm.name,
                    IP: farm.ip,
                    curcoin: farm.curcoin,
                    Stat: farm.Stat || {},
                    Hash: crypto.createHmac('sha256', tools.createFarmKey(farm.name,farm.ip)).digest('hex')
                })
            });
            callback(null, result);
        })
    };

    this.getUserLiveStats = function(user, callback){
        models.Farm.findAll({ where: {name: {$like: user+'/%'}}, include: [ 'Stat' ]}).then( farms => {
            var result = {};
            farms.forEach(function(farm) {
                result[farm.name] = JSON.stringify({
                    Name: farm.name,
                    IP: farm.ip,
                    curcoin: farm.curcoin,
                    Stat: farm.Stat || {},
                    Hash: crypto.createHmac('sha256', tools.createFarmKey(farm.name,farm.ip)).digest('hex')
                })
            });
            callback({error:null,  result : result, coins: _this.coinSetup.coins.map(function (obj) { return obj.coin })} );
        })
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
        models.User.findOne({ where: {name: login}}).then( user => {
            if (user) {
                return callback({result:null, error:"User already registered"});
            } else {
                models.User.create({ name: login, password: tools.hidePwd(password), referralcode: tools.hidePwd(login) }).then( created => {
                    if (refcode && refcode.length>0){
                        /*
                            Refferal program
                         */
                        models.User.findOne({where: {referralcode: refcode}}).then(user => {
                            if (user) {
                                models.Upayoffs.create({ recipient: user.name, percent:portalConfig.referralPercent, subject: 'referral payment '+ (portalConfig.referralPercent * 100) +'%', user_id: created.id})
                                return callback({result:true, error:null, user_id:created.id});
                            } else {
                                created.destroy();
                                return callback({result:null, error:"Wrong referral code"});
                            }
                        });
                    } else {
                        return callback({result:true, error:null, user_id:created.id});
                    }
                }).catch(error => {
                    return callback({result:null, error:"User already registered"});
                });
            }
        })
    };

    this.loginUser = function(login, password, confcode, callback){
        models.User.findOne({ where: {name: login}, include: [ 'Settings' ]}).then( user => {
            if( user === null ) {
                callback({result:null, error:"No such user", conf:false});
                return;
            }
            if( tools.hidePwd(password) !== user.password ) {
                callback({result:null, error:"Incorrect password", conf:false});
                return;
            }
            if (confcode === 'wo') {
                callback({result: true, error: null, conf:false, user: {id: user.id, name: user.name, telegram: user.telegram}});
                return;
            }
            var tfauth = user.Settings.find(el => el.name === 'tfauth');
            var confirmed = false;
            switch(tfauth ? tfauth.value : "none"){
                case 'telegram': {
                    if ( confcode === 'new' || Date.now() - user.lConfirmationSendTime > 2 * 60 * 1000 ) {
                        user.lConfirmationSendTime = Date.now();
                        user.save();
                        models.Confcode.create({ user_id: user.id, code: tools.generateCode(), time: user.lConfirmationSendTime });
                        callback({result: null, error: "New confirmation code sending to yours telegram", conf:true});
                        return;
                    } else {
                        models.Confcode.findOne({ where: {user_id: user.id, is_send:1, time:user.lConfirmationSendTime}}).then( sended_code => {
                            if ( !sended_code ){
                                callback({result: null, error: "Wrong confirmation code", conf:true});
                                return;
                            }
                            if (sended_code.code !== confcode) {
                                callback({result: null, error: "Wrong confirmation code", conf:true});
                                return;
                            } else {
                                user.lConfirmationSendTime = 0;
                                user.save();

                                callback({result: true, error: null, conf:true, user: {id: user.id, name: user.name, telegram: user.telegram}});
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
                callback({result: true, error: null, conf:false, user: {id: user.id, name: user.name, telegram: user.telegram}});
            }
        })
    };

    this.getUserInfo = function(login, password, callback){
        models.User.findOne({ where: {name: login}, include: [ 'Settings', 'Wallets' ] }).then( user => {
            if( !user ){
                callback({result:null, error:"No such user"});
                return;
            }
            if( password !== user.password) {
                callback({result:null, error:"Incorrect password"});
                return;
            }
            callback({result:{name:user.name, wallets:tools.settingsArrayToMap(user.Wallets), telegram:user.telegram, settings:tools.settingsArrayToMap(user.Settings), refcode:user.referralcode}, error:null});
        });
    };

    this.getTelegramUsers = function(callback){
        models.User.findAll({ where: { telegram: {$ne: ''}}}).then( users => {
            if( users.length === 0){
                callback(null, "No such users");
                return;
            }
            var telegramUsers = [];
            users.forEach(function(user) {
                telegramUsers.push({name:user.name,userdata:{id:user.id, telegram:user.telegram, name:user.name}});
            });

            callback(telegramUsers, null);
        });
    };

    this.getUsers = function(username, callback){
        models.User.findAll({ where: {name: {$like: '%'+username+'%'}}, include: ['Wallets', 'Payoffs'] }).then( users => {
            if( users.length === 0){
                callback({dataArray:[], error:null});
                return;
            }
            var resultUsers = [];
            users.forEach(function(user) {
                resultUsers.push({name:user.name,userdata:{id:user.id, telegram:user.telegram, name:user.name, Wallets: user.Wallets, Payoffs: user.Payoffs}});
            });

            callback(null, {dataArray:resultUsers, error:null});
        });
    };

    this.getUser = function(uname, callback){
        models.User.findOne({ where: {name: uname}, include: ['Wallets', 'Payoffs'] }).then( user => {
            if( !user ){
                callback(null, {user:null, error:null});
                return;
            }

            callback(null, {user:{name:user.name,userdata:{id:user.id, telegram:user.telegram, name:user.name, Wallets: user.Wallets, Payoffs: user.Payoffs}}, error:null});
        });
    };

    this.addPayoff = function(uname, recipient, percent, subject, callback){
        if (!recipient){
            callback(null, {result:false, error:"Empty recipient"});
            return;
        }
        models.User.findOne({ where: {name: uname}}).then( user => {
            if( !user ){
                callback(null, {result:false, error:"No such user"});
                return;
            }

            models.Upayoffs.findOrCreate({where: {recipient: recipient, user_id: user.id}}).spread((payoff, created) => {
                payoff.percent = parseFloat((percent || 0).replace(/,/gi,'.'));
                payoff.subject = subject;
                payoff.save();
                callback(null, {result:true, error:null});
            })
        });
    };

    this.deletePayoff = function(uname, recipient, callback){
        if (!recipient){
            callback(null, {result:false, error:"Empty recipient"});
            return;
        }
        models.User.findOne({ where: {name: uname}}).then( user => {
            if( !user ){
                callback(null, {result:false, error:"No such user"});
                return;
            }

            models.Upayoffs.destroy({where: {recipient: recipient, user_id: user.id}}).then(() => {
                callback(null, {result:true, error:null});
            })
        });
    };

    this.getUserTelegram = function(clientname, callback) {
        models.User.findOne({ where: {name: clientname} }).then( user => {
            if( !user ){
                callback(null, "No such user");
                return;
            }
            if( user.telegram === '' ){
                callback(null, "Unregistered telegram");
                return;
            }

            callback({telegram:user.telegram}, null);
        })
    };

    this.getUserBalance = function( login, password, callback){
        models.User.findOne({ where: {name: login}, include: [ 'Settings', 'Wallets' ] }).then( user => {
            if( !user ){
                callback({result:null, error:"No such user"});
                return;
            }
            if( password !== user.password) {
                callback({result:null, error:"Incorrect password"});
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
                                if( user.name == tools.parseName(r)[0] )
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
                        models.Payouts.findOne({where: {name: user.name, coin: coin, status:0}}).then( payout => {
                            if (payout) balances[coin].balance += parseFloat(payout.value);
                            callback();
                        })
                    }, function (callback) {
                        models.Ubalance.findOne({where: {name: user.name, coin: coin}}).then( balance => {
                            if (balance) balances[coin].balance += parseFloat(balance.value);
                            callback();
                        })
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
        models.User.findOne({ where: {name: login}, include: [ 'Settings', 'Wallets' ]}).then( user => {
            if( user === null ) {
                callback({result:null, error:"No such user", conf:false});
                return;
            }
            if( password !== user.password ) {
                callback({result:null, error:"Incorrect password", conf:false});
                return;
            }
            var tfauth = user.Settings.find(el => el.name === 'tfauth');
            var confirmed = false;
            switch(tfauth ? tfauth.value : "none"){
                case 'telegram': {
                    if ( confcode === 'new' || Date.now() - user.wConfirmationSendTime > 2 * 60 * 1000 ) {
                        user.wConfirmationSendTime = Date.now();
                        user.save();
                        models.Confcode.create({ user_id: user.id, code: tools.generateCode(), time: user.wConfirmationSendTime });
                        callback({result: null, error: "New confirmation code sending to yours telegram", conf:true});
                        return;
                    } else {
                        models.Confcode.findOne({ where: {user_id: user.id, is_send:1, time:user.wConfirmationSendTime}}).then( sended_code => {
                            if ( !sended_code ){
                                callback({result: null, error: "Wrong confirmation code", conf:true});
                                return;
                            }
                            if (sended_code.code !== confcode) {
                                callback({result: null, error: "Wrong confirmation code", conf:true});
                                return;
                            } else {
                                user.wConfirmationSendTime = 0;
                                Object.keys(wallets).forEach(function(coin) {
                                    var wallet = user.Wallets.find(el => el.name === coin);
                                    if (wallet){
                                        wallet.value = wallets[coin];
                                        wallet.save()
                                    } else {
                                        models.Uwallets.create({
                                            user_id: user.id,
                                            name: coin,
                                            value: wallets[coin]
                                        })
                                    }
                                });
                                Object.keys(settings).forEach(function(coin) {
                                    var setting = user.Settings.find(el => el.name === "minpayments_"+coin.replace(/\s/gi,''));
                                    if (setting){
                                        setting.value = parseFloat(settings[coin].replace(/,/gi,'.')) || 0.01;
                                        setting.save()
                                    } else {
                                        models.Usettings.create({
                                            user_id: user.id,
                                            name: "minpayments_"+coin.replace(/\s/gi,''),
                                            value: parseFloat(settings[coin].replace(/,/gi,'.')) || 0.01
                                        })
                                    }
                                });
                                user.save();

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
                Object.keys(wallets).forEach(function(coin) {
                    var wallet = user.Wallets.find(el => el.name === coin);
                    if (wallet){
                        wallet.value = wallets[coin];
                        wallet.save()
                    } else {
                        models.Uwallets.create({
                            user_id: user.id,
                            name: coin,
                            value: wallets[coin]
                        })
                    }
                });
                Object.keys(settings).forEach(function(coin) {
                    var setting = user.Settings.find(el => el.name === "minpayments_"+coin.replace(/\s/gi,''));
                    if (setting){
                        setting.value = parseFloat(settings[coin].replace(/,/gi,'.')) || 0.01;
                        setting.save()
                    } else {
                        models.Usettings.create({
                            user_id: user.id,
                            name: "minpayments_"+coin.replace(/\s/gi,''),
                            value: parseFloat(settings[coin].replace(/,/gi,'.')) || 0.01
                        })
                    }
                });

                callback({result: true, error: null, conf:false});
                return;
            }
        })
    };

    this.addTelegram = function(login, password, telegram, callback){
        models.User.findOne({ where: {name: login}}).then( user => {
            if( user === null ) {
                callback({result:null, error:"No such user"});
                return;
            }
            if( password !== user.password ) {
                callback({result:null, error:"Incorrect password"});
                return;
            }
            user.telegram = telegram;
            user.save();

            callback({result:true, error:null});
        })
    };

    this.getUserFarms = function(login, password, farmName, callback){
        models.User.findOne({ where: {name: login}}).then( user => {
            if( user === null ) {
                callback({dataArray:null, error:"No such user"});
                return;
            }
            if( password !== user.password ) {
                callback({dataArray:null, error:"Incorrect password"});
                return;
            }
            models.Farm.findAll({ where: {name: {$like: user.name+'%'}}}).then( farms => {
                var dataArray = [];
                farms.forEach(function(farm) {
                    dataArray.push(farm.name.substr(farm.name.indexOf("/")+1,farm.name.length));
                });
                callback({dataArray:dataArray, error:null});
            })
        })
    };

    this.getFarmlist = function(callback){
        models.Farm.findAll().then( farms => {
            var dataArray = [];
            farms.forEach(function(farm) {
                dataArray.push(tools.parseName(farm.name));
            });
            callback({dataArray:dataArray, error:null});
        })
    };

    this.addSysMessage = function(username, worker, message, callback){
        models.User.findOne({ where: {name: username}}).then( user => {
            if (!user) return callback("Access error.");
            var parsedmessage = JSON.parse(message);
            models.Umessages.findOrCreate({where: {user_id: user.id, cmd: parsedmessage.cmd, sendedAt: 0}}).spread((message, created) => {
                if (!created){
                    return callback("Already in the queue.");
                } else {
                    message.params = JSON.stringify(parsedmessage.params);
                    message.createdAt = Date.now();
                    message.farm = username + '/' + worker;
                    message.save();
                    return callback("Your command will be completing soon");
                }
            })
        })
    };

    this.getNewMessages = function(login, callback){
        models.Umessages.findAll({ where: { farm: login, sendedAt: 0 }}).then( messages => {
            if (messages.length === 0) return callback({messages:[], login:login});
            var messageArray = [];
            messages.forEach(function(message) {
                messageArray.push({cmd:message.cmd, params: JSON.parse(message.params)});
                message.sendedAt = Date.now();
                message.save()
            });
            callback({messages:messageArray, login:login});
        })
    };

    this.loginAdmin = function(login, password, callback){
        models.Admin.findOne({ where: {name: login}}).then( admin => {
            if( admin === null ) {
                callback({result:null, error:"No such admin"});
                return;
            }
            if( tools.hidePwd(password) !== admin.password ) {
                callback({result:null, error:"Incorrect password"});
                return;
            }
            callback({result: true, error: null, adm: {id: admin.id, name: admin.name, telegram: admin.telegram}});
        })
    };

    this.setAdminTelegram = function(login, password, telegram, callback){
        models.Admin.findOne({ where: {name: login}}).then( admin => {
            if( admin === null ) {
                callback({result:null, error:"No such admin"});
                return;
            }
            if( tools.hidePwd(password) !== admin.password ) {
                callback({result:null, error:"Incorrect password"});
                return;
            }
            admin.telegram = telegram;
            admin.save();

            callback({result:true, error:null});
        })
    };

    this.getAdminTelegrams = function(callback){
        models.Admin.findAll({ where: { telegram: {$ne: ''}}}).then( admins => {
            if (admins.length === 0){
                callback(null, "No such admins");
                return;
            }
            var telegramAdmins=[];
            admins.forEach(function(admin) {
                telegramAdmins.push(admin.telegram);
            });

            callback(telegramAdmins, null);
        })
    };

    this.getNewConfirmationCodes = function(userdata, callback){
        models.Confcode.findAll({ where: { is_send: 0, user_id:userdata.id }}).then( codes => {
            if( codes.length === 0){
                callback([]);
                return;
            }
            var codesforsend = [];
            codes.forEach(function (code) {
                codesforsend.push(code.code);
                code.is_send = 1;
                code.save()
            });
            callback(codesforsend);
        })
    };

    this.checkCoinSwitchAccess = function(login, password, names, coin, callback){
        models.User.findOne({ where: {name: login}}).then( user => {
            if( user === null ) {
                return callback(false);
            }
            if( password !== user.password ) {
                return callback(false);
            }
            if (login !== names[0]) return callback(false);
            models.Farm.findAll({ where: {name: {$like: user.name+'%'}}}).then( farms => {
                var access = false;
                farms.forEach(function(farm) {
                    if (farm.name.substr(farm.name.indexOf("/")+1,farm.name.length) === names[1] && farm.curcoin !== coin) {
                        access = true;
                    }
                });
                return callback(access);
            })
        })
    };

    this.checkBaseCommandAccess = function(login, password, names, callback){
        models.User.findOne({ where: {name: login}}).then( user => {
            if( user === null ) {
                return callback(false);
            }
            if( password !== user.password ) {
                return callback(false);
            }
            if (login !== names[0]) return callback(false);
            models.Farm.findAll({ where: {name: {$like: user.name+'%'}}}).then( farms => {
                var access = false;
                farms.forEach(function(farm) {
                    if (farm.name.substr(farm.name.indexOf("/")+1,farm.name.length) === names[1]) {
                        access = true;
                    }
                });
                return callback(access);
            })
        })
    };

    this.getUserPayouts = function(login, password, coin, callback){
        models.User.findOne({ where: {name: login},
                              include: [ { association: 'Payments', where: {coin: coin}, required: false, include: [ 'transaction' ] } ],
                              order: [ [ 'Payments', 'time', 'DESC' ] ]}).then( user => {
            if( user === null ) {
                return callback({error:"No user",dataArray:null});
            }
            if( password !== user.password ) {
                return callback({error:"Access error",dataArray:null});
            }
            return callback({error:null,dataArray:user.Payments});
        })
    };

    this.updateUserSettings = function(login, password, settings, confcode, callback){
        models.User.findOne({ where: {name: login}, include: [ 'Settings' ]}).then( user => {
            if( user === null ) {
                callback({result:null, error:"No such user", conf:false});
                return;
            }
            if( password !== user.password ) {
                callback({result:null, error:"Incorrect password", conf:false});
                return;
            }
            if( settings['tfauth'] !== 'none' && user.telegram === '') {
                callback({result:null, error:"Telegram is not connected", conf:false});
                return;
            }
            var tfauth = user.Settings.find(el => el.name === 'tfauth');
            var confirmed = false;
            switch(tfauth ? tfauth.value : "none"){
                case 'telegram': {
                    if ( confcode === 'new' || Date.now() - user.sConfirmationSendTime > 2 * 60 * 1000 ) {
                        user.sConfirmationSendTime = Date.now();
                        user.save();
                        models.Confcode.create({ user_id: user.id, code: tools.generateCode(), time: user.sConfirmationSendTime });
                        callback({result: null, error: "New confirmation code sending to yours telegram", conf:true});
                        return;
                    } else {
                        models.Confcode.findOne({ where: {user_id: user.id, is_send:1, time:user.sConfirmationSendTime}}).then( sended_code => {
                            if ( !sended_code ){
                                callback({result: null, error: "Wrong confirmation code", conf:true});
                                return;
                            }
                            if (sended_code.code !== confcode) {
                                callback({result: null, error: "Wrong confirmation code", conf:true});
                                return;
                            } else {
                                user.sConfirmationSendTime = 0;
                                Object.keys(settings).forEach(function(parameter) {
                                    var setting = user.Settings.find(el => el.name === parameter);
                                    if (setting){
                                        setting.value = settings[parameter];
                                        setting.save()
                                    } else {
                                        models.Usettings.create({
                                            user_id: user.id,
                                            name: parameter,
                                            value: settings[parameter]
                                        })
                                    }
                                });
                                user.save();

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
                Object.keys(settings).forEach(function(parameter) {
                    var setting = user.Settings.find(el => el.name === parameter);
                    if (setting){
                        setting.value = settings[parameter];
                        setting.save()
                    } else {
                        models.Usettings.create({
                            user_id: user.id,
                            name: parameter,
                            value: settings[parameter]
                        })
                    }
                });

                callback({result: true, error: null, conf:false});
                return;
            }
        })
    };

    this.getUserLastPayouts = function( login, password, callback){
        models.User.findOne({ where: {name: login},
                              include: [ { association: 'Payments', required: false, include: [ 'transaction' ] } ],
                              order: [ [ 'Payments', 'time', 'DESC' ] ]}).then( user => {
            if( user === null ) {
                return callback({error:"No user",dataArray:null});
            }
            if( password !== user.password ) {
                return callback({error:"Access error",dataArray:null});
            }
            /*
                f`kin sequelize`s bug with limit forces me to use array.slice
             */
            return callback({error:null,dataArray:user.Payments.slice(0,5)});
        })
    };

    this.dumpHistory = function(){
        var retentionTime = (((Date.now() / 1000) - portalConfig.website.stats.historicalRetention) | 0).toString();
        redisStats.keys("*:liveStat:*", function (err, results) {
            var getstat = function (x) {
                redisStats.zrangebyscore(results[x], "-Inf", "(" + retentionTime, function (err, result) {
                    var curcoin = results[x].split(':')[0];
                    result.forEach(function (res) {
                        var stat = JSON.parse(res);
                        models.Historyfarm.findOrCreate({where: {name: stat.Name, ip: stat.IP, coin: curcoin}}).spread((farm, created) => {
                            var t = Object.keys(stat.Stat).length
                            if (Object.keys(stat.Stat).length === 4){
                                models.Historystat.findOrCreate({where: {farm_id: farm.id, time: stat.Time}}).spread((historystat, statcreated) => {
                                    historystat.hashrate = parseFloat(stat.Stat.hashrate);
                                    historystat.gpuhashrate = stat.Stat.gpuhashrate.join(',');
                                    historystat.temperature = stat.Stat.temperature.join(',');
                                    historystat.speed = stat.Stat.speed.join(',');
                                    historystat.save();
                                })
                            }
                        });
                    });
                    clearstat(x);
                    if (x + 1 < results.length) getstat(x + 1);
                });
            };
            var clearstat = function (x) {
                redisStats.zremrangebyscore(results[x], "-Inf", "(" + retentionTime, function (err, result) {});
            };
            if (results.length > 0) getstat(0);
        });
    }
};
