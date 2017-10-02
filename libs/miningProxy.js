var redis = require('redis');
var minerapi = require('./apiClaymore.js');
var tools = require('./addtools.js');
var request = require('request');
var nonce   = require('nonce');
var crypto = require('crypto');

module.exports = function(logger ){
    var poolConfigs = JSON.parse(process.env.pools);
    var portalConfig = JSON.parse(process.env.portalConfig);

    var redisConfig = portalConfig.redis;

    var forkId = process.env.forkId;
    var logSystem = 'Monitor';
    var logComponent = 'local';
    var logSubCat = 'Thread ' + (parseInt(forkId) + 1);

    var redisClient = redis.createClient(redisConfig.port, redisConfig.host);

    var miners = [];
    var PRIVATE_API_URL = portalConfig.monitoring.proxiedProtocol+'://'+portalConfig.monitoring.proxiedHost+'/api/sys',
        PUBLIC_API_URL = portalConfig.monitoring.proxiedProtocol+'://'+portalConfig.monitoring.proxiedHost+'/api/user',
        USER_AGENT      = 'nomp/node-open-mining-portal';
    var STRICT_SSL = false;

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
        var parts = response.split('\r\n');
        var version;
        var versionString;
        for (var i = 0; i < parts.length; i++){
            if (parts[i].indexOf(':') !== -1){
                var valParts = parts[i].split(':');
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

    var monitoringInterval = setInterval(function(){
        try {
            processCommandMonitoring();
        } catch(e){
            throw e;
        }
    }, 10*1000);

    var receiveInterval = setInterval(function(){
        try {
            processReceiveCommand();
        } catch(e){
            throw e;
        }
    }, 15*1000);

    var processCommandMonitoring = function()
    {
        Object.keys(poolConfigs).forEach(function(coin) {

            var poolOptions = poolConfigs[coin];

            var curcoin = poolOptions.coin.name;

            redisClient.hgetall(curcoin + ":liveStat", function (err, object) {
                if (err || !object) return;
                Object.values(object).forEach(function (x) {
                    var farm = JSON.parse(x);
                    var ip = farm.IP;
                    var names = tools.parseName(farm.Name);
                    redisClient.zscan('users:messages:'+names[0], 0, 'match', names[1]+'::*::0', 'count', '1000', function(err, results){
                        if (results[1].length===0){
                            return;
                        } else {
                            if (miners.indexOf(ip) === -1) {
                                var miner = new minerapi.interface(ip, 3333, logger);
                                miners[ip] = miner;
                                miner.init();
                            }
                            for (index = 0; index < results[1].length; index += 2) {
                                var message = JSON.parse(results[1][index].split('::')[1]);
                                var time = results[1][index+1];
                                sendCommand(ip,message);
                                redisClient.zrem('users:messages:' + names[0], [names[1], JSON.stringify(message), 0].join('::'), function (err, res) {
                                    redisClient.zadd('users:messages:' + names[0], time, [names[1], JSON.stringify(message), Math.floor(Date.now() / 1000)].join('::'), function (err, results) {
                                    });
                                });
                            }
                        }
                    })
                });
            });
        });
    };

    var processReceiveCommand = function()
    {
        Object.keys(poolConfigs).forEach(function(coin) {
            var poolOptions = poolConfigs[coin];
            var curcoin = poolOptions.coin.name;

            redisClient.hgetall(curcoin + ":liveStat", function (err, object) {
                if (err || !object) return;
                Object.values(object).forEach(function (x) {
                    var farm = JSON.parse(x);
                    var names = tools.parseName(farm.Name);
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

    function sendCommand(ip, command) {
        var miner = miners[ip];
        switch(command.cmd){
            case 'restart': {
                miner.cmd('miner_restart',[]);
                return;
            }
            case 'stop': {
                miner.cmd('control_gpu',['-1','0']);
                return;
            }
            case 'start': {
                miner.cmd('control_gpu',['-1','1']);
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
        var options;
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
        var options;

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