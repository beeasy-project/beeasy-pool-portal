var Stratum = require('stratum-pool');
var redis   = require('redis');
var net     = require('net');
var minerapi = require('./apiClaymore.js');
var crypto = require('crypto');

var MposCompatibility = require('./mposCompatibility.js');
var ShareProcessor = require('./shareProcessor.js');
const tools = require('./addtools.js');

module.exports = function(logger){

    var _this = this;

    var poolConfigs  = JSON.parse(process.env.pools);
    var portalConfig = JSON.parse(process.env.portalConfig);

    var forkId = process.env.forkId;
    
    var pools = {};

    var proxySwitch = {};

    var redisClient = redis.createClient(portalConfig.redis.port, portalConfig.redis.host);

    let models = null;
    if (portalConfig.mysql.enabled)
        models = require('../models');

    //Handle messages from master process sent via IPC
    process.on('message', function(message) {
        switch(message.type){
            case 'minerstat':
                for( var p in pools)
                {
                    var clients;
                    if( pools[p].stratumServer )
                        clients = pools[p].stratumServer.getStratumClients();
                    for( var c in clients )
                        if( clients[c].getLabel() === message.client || clients[c].Name === message.client)
                            clients[c].stat = message.stat;
                }
                break;
            case 'banIP':
                for (var p in pools){
                    if (pools[p].stratumServer)
                        pools[p].stratumServer.addBannedIP(message.ip);
                }
                break;

            case 'blocknotify':

                var messageCoin = message.coin.toLowerCase();
                var poolTarget = Object.keys(pools).filter(function(p){
                    return p.toLowerCase() === messageCoin;
                })[0];

                if (poolTarget)
                    pools[poolTarget].processBlockNotify(message.hash, 'blocknotify script');

                break;

            // IPC message for pool switching
            case 'coinswitch':
                var logSystem = 'Proxy';
                var logComponent = 'Switch';
                var logSubCat = 'Thread ' + (parseInt(forkId) + 1);

                var switchName = message.switchName;

                var newCoin = message.coin;

                var algo = poolConfigs[newCoin].coin.algorithm;

                var newPool = pools[newCoin];
                var oldCoin = proxySwitch[switchName].currentPool;
                var oldPool = pools[oldCoin];
                var proxyPorts = Object.keys(proxySwitch[switchName].ports);

                if (newCoin == oldCoin) {
                    logger.debug(logSystem, logComponent, logSubCat, 'Switch message would have no effect - ignoring ' + newCoin);
                    break;
                }

                logger.debug(logSystem, logComponent, logSubCat, 'Proxy message for ' + algo + ' from ' + oldCoin + ' to ' + newCoin);

                if (newPool) {
                    oldPool.relinquishMiners(
                        function (miner, cback) { 
                            // relinquish miners that are attached to one of the "Auto-switch" ports and leave the others there.
                            cback(proxyPorts.indexOf(miner.client.socket.localPort.toString()) !== -1)
                        }, 
                        function (clients) {
                            newPool.attachMiners(clients);
                        }
                    );
                    proxySwitch[switchName].currentPool = newCoin;

                    redisClient.hset('proxyState', algo, newCoin, function(error, obj) {
                        if (error) {
                            logger.error(logSystem, logComponent, logSubCat, 'Redis error writing proxy config: ' + JSON.stringify(err))
                        }
                        else {
                            logger.debug(logSystem, logComponent, logSubCat, 'Last proxy state saved to redis for ' + algo);
                        }
                    });

                }
                break;
        }
    });


    Object.keys(poolConfigs).forEach(function(coin) {

        var poolOptions = poolConfigs[coin];

        var logSystem = 'Pool';
        var logComponent = coin;
        var logSubCat = 'Thread ' + (parseInt(forkId) + 1);

        var handlers = {
            auth: function(){},
            share: function(){},
            diff: function(){}
        };

        //Functions required for MPOS compatibility
        if (poolOptions.mposMode && poolOptions.mposMode.enabled){
            var mposCompat = new MposCompatibility(logger, poolOptions);

            handlers.auth = function(port, workerName, password, authCallback){
                mposCompat.handleAuth(workerName, password, authCallback);
            };

            handlers.share = function(isValidShare, isValidBlock, data){
                mposCompat.handleShare(isValidShare, isValidBlock, data);
            };

            handlers.diff = function(workerName, diff){
                mposCompat.handleDifficultyUpdate(workerName, diff);
            }
        }

        //Functions required for internal payment processing
        else {

            var shareProcessor = new ShareProcessor(logger, poolOptions);

            handlers.auth = function(port, workerName, password, authCallback){
                if (poolOptions.validateWorkerUsername !== true)
                    return authCallback(true);
                else {
                    if (workerName.length === 40 ){
                        try {
                            new Buffer(workerName, 'hex');
                            authCallback(true);
                        }
                        catch (e) {
                            authCallback(false);
                        }
                    } else if(workerName.length ===  42 && workerName.substr(0, 2) === "0x" ){
                        try {
                            new Buffer(workerName.substr(2), 'hex');
                            authCallback(true);
                        }
                        catch (e) {
                            authCallback(false);
                        }
                    } else {
                        let names = tools.parseName(workerName);
                        redisClient.hget("users", names[0].toLowerCase(), function(err, result) {
                            if( err || !result){
                                if (models){
                                    models.User.findOne({where: {name: names[0]}}).then(user => {
                                        if (!user) return authCallback(false);
                                        else redisClient.hset("users", user.name.toLowerCase(), JSON.stringify({password:""}));
                                        return authCallback(true);
                                    });
                                } else return authCallback(false);
                            } else return authCallback(true);
                        });
                    }
                }
            };

            handlers.share = function(isValidShare, isValidBlock, isBlock,  data){
                shareProcessor.handleShare(isValidShare, isValidBlock, isBlock, data);
            };
        }

        var authorizeFN = function (ip, port, workerName, password, callback) {
            handlers.auth(port, workerName, password, function(authorized){

                var authString = authorized ? 'Authorized' : 'Unauthorized ';

                logger.debug(logSystem, logComponent, logSubCat, authString + ' ' + workerName + ':' + password + ' [' + ip + ']');
                callback({
                    error: null,
                    authorized: authorized,
                    disconnect: false
                });
            });
        };


        var pool = Stratum.createPool(poolOptions, authorizeFN, logger);
        pool.on('share', function(isValidShare, isValidBlock, isBlock,  data) {

            var shareData = JSON.stringify(data);

            if (data.blockHash && !isValidBlock && !isBlock)
                logger.debug(logSystem, logComponent, logSubCat, 'We thought a block was found but it was rejected by the daemon, share data: ' + shareData);

            else if (isValidBlock && isBlock)
                logger.debug(logSystem, logComponent, logSubCat, 'Block found: ' + data.blockHash + ' by ' + data.worker);
            else if (isValidBlock && !isBlock)
                logger.debug(logSystem, logComponent, logSubCat, 'Share found: ' + data.difficulty + ' by ' + data.worker);

            if (isValidShare) {
                if (data.shareDiff > 1000000000)
                    logger.debug(logSystem, logComponent, logSubCat, 'Share was found with diff higher than 1.000.000.000!');
                else if (data.shareDiff > 1000000)
                    logger.debug(logSystem, logComponent, logSubCat, 'Share was found with diff higher than 1.000.000!');
                logger.debug(logSystem, logComponent, logSubCat, 'Share accepted at diff ' + data.difficulty + '/' + data.shareDiff + ' by ' + data.worker + ' [' + data.ip + ']');

            } else if (!isValidShare)
                logger.debug(logSystem, logComponent, logSubCat, 'Share rejected: ' + shareData);

            handlers.share(isValidShare, isValidBlock, isBlock, data)

        }).on('client.live', function(client){
            redisClient.hget( poolOptions.coin.name + ':liveStat', client.getLabel().toLowerCase(), function(err, result) {
                let curstat;
                if( !err && result  )
                {
                    curstat = JSON.parse(result);
                    client.stat = curstat.Stat;
                    client.avgStat = curstat.avgStat;
                    client.warningtimes = curstat.warningtimes;
                    client.statTime = curstat.statTime;
                    client.upTime = curstat.status !== 1 ? Date.now() : curstat.upTime;
                    client.status = 1;
                    client.is_stoped = curstat.is_stoped === 1 && Date.now() - curstat.Time < 10 * 60 * 1000 ? 0 : curstat.is_stoped;
                    client.is_dc = curstat.is_dc;
                }
                redisClient.hset(poolOptions.coin.name + ':liveStat', client.getLabel().toLowerCase(),
                    JSON.stringify({
                        'Name': client.workerName,
                        "IP": client.remoteAddress,
                        "Time": client.lastActivity,
                        "status": client.status,
                        "is_stoped": client.is_stoped,
                        "Stat": client.stat,
                        "avgStat": client.avgStat,
                        "warningtimes": client.warningtimes,
                        "statTime": client.statTime || Date.now(),
                        "upTime": client.upTime || Date.now(),
                        "is_dc": client.is_dc || 0
                    })
                );
                let clienthash = crypto.createHmac('sha256', client.getLabel().toLowerCase()).digest('hex');
                redisClient.zadd(poolOptions.coin.name + ':liveStat:' + clienthash, Math.floor(Date.now() / 1000),
                    JSON.stringify({
                        'Name': client.workerName,
                        "IP": client.remoteAddress,
                        "Time": client.lastActivity,
                        "Stat": client.stat
                    })
                );
                if (!curstat || (curstat.status !== 1 && client.status === 1)){
                    let wnames = tools.parseName(client.workerName);
                    process.send({
                        type: "mineralert",
                        client: wnames[0],
                        message: "На ваш аккаунт заработал майнер " + wnames[1]
                    });
                }
//                var claymore = new minerapi.interface(client.remoteAddress, 3333, logger);
//                claymore.init();
//                claymore.stat();
                process.send({
                    type: "proxyreg",
                    coin: coin,
                    client: {
                        "label": client.getLabel(),
                        "workerName": client.workerName,
                        "remoteAddress": client.remoteAddress,
                        "lastActivity": client.lastActivity,
                        "status": 1,
                        "stat": client.stat,
                        "avgStat": client.avgStat,
                        "warningtimes": client.warningtimes
                    },
                    "clienthash": clienthash
                });
            });
        }).on('client.disconnected', function(client){
//            redisClient.hdel(poolOptions.coin.name + ':liveStat', client.getLabel() );
        }).on('difficultyUpdate', function(workerName, diff){
            logger.debug(logSystem, logComponent, logSubCat, 'Difficulty update to diff ' + diff + ' workerName=' + JSON.stringify(workerName));
            handlers.diff(workerName, diff);
        }).on('log', function(severity, text) {
            logger[severity](logSystem, logComponent, logSubCat, text);
        }).on('banIP', function(ip, worker){
            process.send({type: 'banIP', ip: ip});
        }).on('started', function(){
            _this.setDifficultyForProxyPort(pool, poolOptions.coin.name, poolOptions.coin.algorithm);
        });

        pool.start();
        pools[poolOptions.coin.name] = pool;
    });


    if (portalConfig.switching) {

        var logSystem = 'Switching';
        var logComponent = 'Setup';
        var logSubCat = 'Thread ' + (parseInt(forkId) + 1);

        var proxyState = {};

        //
        // Load proxy state for each algorithm from redis which allows NOMP to resume operation
        // on the last pool it was using when reloaded or restarted
        //
        logger.debug(logSystem, logComponent, logSubCat, 'Loading last proxy state from redis');



        /*redisClient.on('error', function(err){
            logger.debug(logSystem, logComponent, logSubCat, 'Pool configuration failed: ' + err);
        });*/

        redisClient.hgetall("proxyState", function(error, obj) {
            if (!error && obj) {
                proxyState = obj;
                logger.debug(logSystem, logComponent, logSubCat, 'Last proxy state loaded from redis');
            }

            //
            // Setup proxySwitch object to control proxy operations from configuration and any restored
            // state.  Each algorithm has a listening port, current coin name, and an active pool to
            // which traffic is directed when activated in the config.
            //
            // In addition, the proxy config also takes diff and varDiff parmeters the override the
            // defaults for the standard config of the coin.
            //
            Object.keys(portalConfig.switching).forEach(function(switchName) {

                var algorithm = portalConfig.switching[switchName].algorithm;

                if (!portalConfig.switching[switchName].enabled) return;


                var initalPool = proxyState.hasOwnProperty(algorithm) ? proxyState[algorithm] : _this.getFirstPoolForAlgorithm(algorithm);
                proxySwitch[switchName] = {
                    algorithm: algorithm,
                    ports: portalConfig.switching[switchName].ports,
                    currentPool: initalPool,
                    servers: []
                };


                Object.keys(proxySwitch[switchName].ports).forEach(function(port){
                    var f = net.createServer(function(socket) {
                        var currentPool = proxySwitch[switchName].currentPool;

                        logger.debug(logSystem, 'Connect', logSubCat, 'Connection to '
                            + switchName + ' from '
                            + socket.remoteAddress + ' on '
                            + port + ' routing to ' + currentPool);
                        
                        if (pools[currentPool])
                            pools[currentPool].getStratumServer().handleNewClient(socket);
                        else
                            pools[initalPool].getStratumServer().handleNewClient(socket);

                    }).listen(parseInt(port), function() {
                        logger.debug(logSystem, logComponent, logSubCat, 'Switching "' + switchName
                            + '" listening for ' + algorithm
                            + ' on port ' + port
                            + ' into ' + proxySwitch[switchName].currentPool);
                    });
                    proxySwitch[switchName].servers.push(f);
                });

            });
        });
    }

    this.getFirstPoolForAlgorithm = function(algorithm) {
        var foundCoin = "";
        Object.keys(poolConfigs).forEach(function(coinName) {
            if (poolConfigs[coinName].coin.algorithm == algorithm) {
                if (foundCoin === "")
                    foundCoin = coinName;
            }
        });
        return foundCoin;
    };

    //
    // Called when stratum pool emits its 'started' event to copy the initial diff and vardiff 
    // configuation for any proxy switching ports configured into the stratum pool object.
    //
    this.setDifficultyForProxyPort = function(pool, coin, algo) {

        logger.debug(logSystem, logComponent, algo, 'Setting proxy difficulties after pool start');
    };
};
