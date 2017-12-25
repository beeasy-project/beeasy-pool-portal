let redis = require('redis');
let minerapi = require('./apiClaymore.js');
let tools = require('./addtools.js');
let request = require('request');
let nonce   = require('nonce');
let crypto = require('crypto');
let api = require('./api.js');

module.exports = function(logger ){
    let poolConfigs = JSON.parse(process.env.pools);
    let portalConfig = JSON.parse(process.env.portalConfig);

    let redisConfig = portalConfig.redis;

    let forkId = process.env.forkId;
    let logSystem = 'Monitor';
    let logComponent = 'local';
    let logSubCat = 'Thread ' + (parseInt(forkId) + 1);

    let redisClient = redis.createClient(redisConfig.port, redisConfig.host);

    let miners = {};
    let PRIVATE_API_URL = portalConfig.monitoring.proxiedProtocol+'://'+portalConfig.monitoring.proxiedHost+'/api/sys',
        PUBLIC_API_URL = portalConfig.monitoring.proxiedProtocol+'://'+portalConfig.monitoring.proxiedHost+'/api/user',
        USER_AGENT      = 'nomp/node-open-mining-portal';
    let STRICT_SSL = false;
    let portalStats = new api(logger, portalConfig, poolConfigs).stats;

    redisClient.on('ready', function(){
        logger.debug(logSystem, logComponent, logSubCat, 'Proxy processing setup with redis (' + redisConfig.host +
            ':' + redisConfig.port  + ')');
    });
    redisClient.on('error', function(err){
        logger.error(logSystem, logComponent, logSubCat, 'Redis client had an error: ' + JSON.stringify(err))
    });
    redisClient.on('end', function(){
        logger.error(logSystem, logComponent, logSubCat, 'Connection to redis database has been ended');
    });

    redisClient.info(function(error, response){
        if (error){
            logger.error(logSystem, logComponent, logSubCat, 'Redis version check failed');
            return;
        }
        let parts = response.split('\r\n');
        let version;
        let versionString;
        for (let i = 0; i < parts.length; i++){
            if (parts[i].indexOf(':') !== -1){
                let valParts = parts[i].split(':');
                if (valParts[0] === 'redis_version'){
                    versionString = valParts[1];
                    version = parseFloat(versionString);
                    break;
                }
            }
        }
        if (!version){
            logger.error(logSystem, logComponent, logSubCat, 'Could not detect redis version - but be super old or broken');
        }
        else if (version < 2.6){
            logger.error(logSystem, logComponent, logSubCat, "You're using redis version " + versionString + " the minimum required version is 2.6. Follow the damn usage instructions...");
        }
    });

    let monitoringInterval = setInterval(function(){
        try {
            processCommandMonitoring();
        } catch(e){
            throw e;
        }
    }, 10*1000);

    let receiveInterval = setInterval(function(){
        try {
            processReceiveCommand();
        } catch(e){
            throw e;
        }
    }, 15*1000);

    let processCommandMonitoring = function()
    {
        Object.keys(poolConfigs).forEach(function(coin) {

            let poolOptions = poolConfigs[coin];

            let curcoin = poolOptions.coin.name;

            redisClient.hgetall(curcoin + ":liveStat", function (err, object) {
                if (err || !object) return;
                Object.keys(object).forEach(function (x) {
                    let farm = JSON.parse(object[x]);
                    let ip = farm.IP;
                    let names = tools.parseName(farm.Name);
                    redisClient.zscan('users:messages:'+names[0], 0, 'match', names[1]+'::*::0', 'count', '1000', function(err, results){
                        if (results[1].length===0){
                            return;
                        } else {
                            if (Object.keys(miners).indexOf(x) === -1) {
                                let miner = new minerapi.interface(ip, 3333, logger);
                                miners[x] = miner;
                                miner.init();
                            }
                            for (index = 0; index < results[1].length; index += 2) {
                                let message = JSON.parse(results[1][index].split('::')[1]);
                                let time = results[1][index+1];
                                if (time >= (Date.now() - 5 * 60 * 1000) / 1000) {
                                    sendCommand(x, message, names);
                                    redisClient.zrem('users:messages:' + names[0], [names[1], JSON.stringify(message), 0].join('::'), function (err, res) {
                                        redisClient.zadd('users:messages:' + names[0], time, [names[1], JSON.stringify(message), Math.floor(Date.now() / 1000)].join('::'), function (err, results) {
                                        });
                                    });
                                }
                            }
                        }
                    })
                });
            });
        });
    };

    let processReceiveCommand = function()
    {
        Object.keys(poolConfigs).forEach(function(coin) {
            let poolOptions = poolConfigs[coin];
            let curcoin = poolOptions.coin.name;

            redisClient.hgetall(curcoin + ":liveStat", function (err, object) {
                if (err || !object) return;
                Object.values(object).forEach(function (x) {
                    let farm = JSON.parse(x);
                    let names = tools.parseName(farm.Name);
                    _public("messages", { login: farm.Name }, function (err, results) {
                        if (err) return;

                        results.messages.forEach(function (message) {
                            redisClient.zadd('users:messages:' + names[0], Math.floor(Date.now() / 1000), [names[1],JSON.stringify(message),0].join('::'), function(err, results) {
                            });
                        })
                    });
                });
            });
        });
    };

    function sendCommand(x, command, names) {
        let miner = miners[x];
        switch(command.cmd){
            case 'restart': {
                miner.cmd('miner_restart',[]);
                return;
            }
            case 'stop': {
                miner.cmd('control_gpu',['-1','0']);
                portalStats.stopFarm(names[0], names[1], function(result) {});
                return;
            }
            case 'start': {
                miner.cmd('control_gpu',['-1','1']);
                portalStats.startFarm(names[0], names[1], function(result) {});
                return;
            }
            case 'reboot': {
                miner.cmd('miner_reboot',[]);
                return;
            }
        }
    }

    function _request(options, callback){
        if (!('headers' in options)){
            options.headers = {};
        }

        options.headers['User-Agent'] = USER_AGENT;
        options.json = true;
        options.strictSSL = STRICT_SSL;

        request(options, function(err, response, body) {
            if (!err && response && response.statusCode === 200)
                callback(err, body);
            else if (err)
                callback(err,body);
            else if (response)
                callback(response.statusMessage,body);
            else
                callback('Error',body);
        });

        return this;
    }

    function _private(method, parameters, callback){
        let options;
        parameters.secret = crypto.createHmac('sha256', portalConfig.secret).update(portalConfig.salt).digest('hex');
        parameters.nonce = nonce();
        options = {
            method: 'POST',
            url: PRIVATE_API_URL + "/" + method,
            body: parameters
        };

        return _request(options, callback);
    }

    function _public(method, parameters, callback){
        let options;

        parameters.nonce = nonce();
        options = {
            method: 'POST',
            url: PUBLIC_API_URL + "/" + method,
            body: parameters
        };

        return _request(options, callback);
    }

    process.on("message", function(msg){
        switch(msg.type){
            case 'proxystat': {
                _public('minerstat', { login: msg.client, stat: msg.stat, coin: msg.coin, time: msg.time }, function (err, results) {
                    if (err) logger.error(logSystem, logComponent, logSubCat, 'Proxystat had an error: ' + JSON.stringify(err));
                    else if (results.error) logger.error(logSystem, logComponent, logSubCat, 'Proxystat had an error: ' + JSON.stringify(results.error))
                });
                break;
            }
            case 'proxyreg': {
                _private('minerreg', { client: msg.client, coin: msg.coin, clienthash: msg.clienthash }, function (err, results) {
                    if (err) logger.error(logSystem, logComponent, logSubCat, 'Proxyreg had an error: ' + JSON.stringify(err));
                    else if (results.err) logger.error(logSystem, logComponent, logSubCat, 'Proxyreg had an error: ' + JSON.stringify(results.err))
                });
                break;
            }
        }
    });
};