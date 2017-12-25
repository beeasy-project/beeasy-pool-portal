let redis = require('redis');
let minerapi = require('./apiClaymore.js');

/*
This module deals with handling shares when in internal payment processing mode. It connects to a redis
database and inserts shares with the database structure of:

key: coin_name + ':' + block_height
value: a hash with..
        key:

 */



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
    let workers = {};

    redisClient.on('ready', function(){
        logger.debug(logSystem, logComponent, logSubCat, 'Monitoring processing setup with redis (' + redisConfig.host +
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

    let summaryMonitor;
    if (portalConfig.mysql.enabled === true)
        summaryMonitor = require('./miningMonitorSummarySql.js');
    else
        summaryMonitor = require('./miningMonitorSummaryRedis.js');

    let monitoringInterval = setInterval(function(){
        try {
            processMonitoring();
        } catch(e){
            throw e;
        }
    }, 30*1000);

    let processMonitoring = function()
    {
        Object.keys(poolConfigs).forEach(function(coin) {

            let poolOptions = poolConfigs[coin];

            let curcoin = poolOptions.coin.name;

            redisClient.hgetall(curcoin + ":liveStat", function (err, object) {
                if (err || !object) return;
                workers = object;
                Object.keys(object).forEach(function (x, i) {
                    let client = x;
                    let stat = JSON.parse(Object.values(object)[i]);
                    if (stat.status !== 1) return;
                    let ip = stat.IP;
                    let clientname = stat.Name;
                    if (stat.Name.indexOf("/") !== -1) {
                        clientname = stat.Name.substr(0, stat.Name.indexOf("/"));
                    }
                    if (portalConfig.monitoring.local === true) {
                        if (Object.keys(miners).indexOf(client) === -1) {
                            let miner = new minerapi.interface(ip, 3333, logger);
                            miner.on("stat", function (hashrate, cores, gpuhashrate, temperature, speed) {
                                redisClient.hget(coin + ":liveStat", client, function (err, result) {
                                    if (err) {
                                        return;
                                    }
                                    stat = JSON.parse(result);
                                    stat.Stat = {
                                        hashrate: hashrate,
                                        gpuhashrate: gpuhashrate,
                                        temperature: temperature,
                                        speed: speed
                                    };
                                    stat.statTime = Date.now();
                                    process.send({
                                        type: "proxystat",
                                        client: stat.Name,
                                        stat: stat.Stat,
                                        coin: coin,
                                        time: stat.statTime
                                    });
                                    redisClient.hset(coin + ":liveStat", client, JSON.stringify(stat));
                                })
                            });
                            miners[client] = miner;
                            miner.init();
                        }
                        miners[client].stat()
                    }
                    doAnalytics(curcoin, x, clientname, stat);
                });
            });
        });
    };

    let doAnalytics = function(coin, client, clientname, _stat) {
        let statToAnalyse = _stat.Stat;
        let time = _stat.Time;
        if (Date.now() - time > 10 * 60 * 1000) {
            let anotherFarm;
            if (portalConfig.monitoring.local === true || _stat.is_dc === 1){
                anotherFarm = Object.keys(workers).find(el => {
                    let parsedEl = JSON.parse(workers[el]);
                    return (parsedEl.IP === _stat.IP || parsedEl.Name.toLowerCase() === _stat.Name.toLowerCase()) && el !== client && parsedEl.status === 1
                });
            } else {
                anotherFarm = Object.keys(workers).find(el => {
                    let parsedEl = JSON.parse(workers[el]);
                    return parsedEl.Name.toLowerCase() === _stat.Name.toLowerCase() && el !== client && parsedEl.status === 1
                });
            }
            _stat.status = anotherFarm || _stat.is_stoped === 1 ? 0 : 2;
            redisClient.hset(coin + ":liveStat", client, JSON.stringify(_stat));
        } else if (Object.keys(statToAnalyse).length !== 4) {
            logger.error(logSystem, logComponent, logSubCat, 'No data for monitoring.');
        } else {
            let userstat = _stat;
            if (!userstat.avgStat) {
                userstat.avgStat = {
                    count: 1,
                    hashrate: parseFloat(userstat.Stat.hashrate),
                    gpuhashrate: [],
                    temperature: [],
                    speed: []
                };
                for (index = 0; index < userstat.Stat.gpuhashrate.length; ++index) {
                    userstat.avgStat.gpuhashrate.push(parseFloat(userstat.Stat.gpuhashrate[index]));
                    userstat.avgStat.temperature.push(parseFloat(userstat.Stat.temperature[index]));
                    userstat.avgStat.speed.push(parseFloat(userstat.Stat.speed[index]));
                }
            } else {
                let curcount = userstat.avgStat.count;
                userstat.avgStat.count = (curcount === 50 ? 50 : curcount + 1);
                userstat.avgStat.hashrate = (curcount === 50 ? (userstat.avgStat.hashrate * 49 + parseFloat(userstat.Stat.hashrate)) / 50 : (userstat.avgStat.hashrate * curcount + parseFloat(userstat.Stat.hashrate)) / (curcount + 1));
                for (index = 0; index < userstat.Stat.gpuhashrate.length; ++index) {
                    userstat.avgStat.gpuhashrate[index] = (curcount === 50 ? (userstat.avgStat.gpuhashrate[index] * 49 + parseFloat(userstat.Stat.gpuhashrate[index])) / 50 : (userstat.avgStat.gpuhashrate[index] * curcount + parseFloat(userstat.Stat.gpuhashrate[index])) / (curcount + 1));
                    userstat.avgStat.temperature[index] = (curcount === 50 ? (userstat.avgStat.temperature[index] * 49 + parseFloat(userstat.Stat.temperature[index])) / 50 : (userstat.avgStat.temperature[index] * curcount + parseFloat(userstat.Stat.temperature[index])) / (curcount + 1));
                    userstat.avgStat.speed[index] = (curcount === 50 ? (userstat.avgStat.speed[index] * 49 + parseFloat(userstat.Stat.speed[index])) / 50 : (userstat.avgStat.speed[index] * curcount + parseFloat(userstat.Stat.speed[index])) / (curcount + 1));
                }
            }
            redisClient.hset(coin + ":liveStat", client, JSON.stringify(userstat));
        }
        summaryMonitor.run(coin, client, clientname, _stat, redisClient, logger, process);
    };
    setTimeout(processMonitoring, 100);
};