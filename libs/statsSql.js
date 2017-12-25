"use strict";

let zlib = require('zlib');

let redis = require('redis');
let async = require('async');

let crypto = require('crypto');
let os = require('os');
const uuid = require('uuid/v4');

let ExtPoolApi = require('./apiExt.js');

let algos = require('stratum-pool/lib/algoProperties.js');
let tools = require('./addtools.js');
let models = require('../models');

module.exports = function (logger, portalConfig, poolConfigs) {

    let _this = this;

    let logSystem = 'Stats';

    let redisClients = [];
    let redisStats;

    this.statHistory = [];
    this.statPoolHistory = [];

    this.stats = {};
    this.statsString = '';

    this.coinSetup = {coins: []};

    let extPool;

    setupStatsRedis();
    gatherStatHistory();

    let canDoStats = true;

    Object.keys(poolConfigs).forEach(function (coin) {

        if (!canDoStats) return;

        let poolConfig = poolConfigs[coin];
        extPool = new ExtPoolApi(poolConfigs);

        let redisConfig = poolConfig.redis;

        for (let i = 0; i < redisClients.length; i++) {
            let client = redisClients[i];
            if (client.client.port === redisConfig.port && client.client.host === redisConfig.host) {
                client.coins.push(coin);
                return;
            }
        }
        redisClients.push({
            coins: [coin],
            client: redis.createClient(redisConfig.port, redisConfig.host)
        });
        let data = {
            coin: coin,
            host: poolConfigs[coin].stratumHost,
            ports: [],
            algo: poolConfigs[coin].coin.algorithm,
            symbol: poolConfigs[coin].coin.symbol
        };
        Object.keys(poolConfigs[coin].ports).forEach(function (port) {
            let portdata = {
                port: port,
                diff: (typeof poolConfigs[coin].ports[port].difftype !== 'undefined' && poolConfigs[coin].ports[port].difftype === "external") ? 0 : poolConfigs[coin].ports[port].diff
            };
            data.ports.push(portdata);
        });
        _this.coinSetup.coins.push(data);
    });

    function setupStatsRedis() {
        redisStats = redis.createClient(portalConfig.redis.port, portalConfig.redis.host);
        redisStats.on('error', function (err) {
            logger.error(logSystem, 'Historics', 'Redis for stats had an error ' + JSON.stringify(err));
        });
    }

    function gatherStatHistory() {

        let retentionTime = (((Date.now() / 1000) - portalConfig.website.stats.historicalRetention) | 0).toString();

        redisStats.zrangebyscore(['statHistory', retentionTime, '+inf'], function (err, replies) {
            if (err) {
                logger.error(logSystem, 'Historics', 'Error when trying to grab historical stats ' + JSON.stringify(err));
                return;
            }
            for (let i = 0; i < replies.length; i++) {
                _this.statHistory.push(JSON.parse(replies[i]));
            }
            _this.statHistory = _this.statHistory.sort(function (a, b) {
                return a.time - b.time;
            });
            _this.statHistory.forEach(function (stats) {
                addStatPoolHistory(stats);
            });
        });
    }

    function addStatPoolHistory(stats) {
        let data = {
            time: stats.time,
            pools: {}
        };
        for (let pool in stats.pools) {
            data.pools[pool] = {
                hashrate: stats.pools[pool].hashrate,
                workerCount: stats.pools[pool].workerCount,
                blocks: stats.pools[pool].blocks,
                shares: stats.pools[pool].shares
            }
        }
        _this.statPoolHistory.push(data);
    }

    this.getGlobalStats = function (callback) {

        let statGatherTime = Date.now() / 1000 | 0;

        let allCoinStats = {};

        async.each(redisClients, function (client, callback) {
            let windowTime = (((Date.now() / 1000) - portalConfig.website.stats.hashrateWindow) | 0).toString();
            let redisCommands = [];


            let redisCommandTemplates = [
                ['zremrangebyscore', ':hashrate', '-inf', '(' + windowTime],
                ['zrangebyscore', ':hashrate', windowTime, '+inf'],
                ['hgetall', ':stats'],
                ['scard', ':blocksPending'],
                ['scard', ':blocksConfirmed'],
                ['scard', ':blocksOrphaned'],
                ['hvals', ':payouts']
            ];

            let commandsPerCoin = redisCommandTemplates.length;

            client.coins.map(function (coin) {
                redisCommandTemplates.map(function (t) {
                    let clonedTemplates = t.slice(0);
                    clonedTemplates[1] = coin + clonedTemplates[1];
                    redisCommands.push(clonedTemplates);
                });
            });

            client.client.multi(redisCommands).exec(function (err, replies) {
                if (err) {
                    logger.error(logSystem, 'Global', 'error with getting global stats ' + JSON.stringify(err));
                    callback(err);
                }
                else {
                    for (let i = 0; i < replies.length; i += commandsPerCoin) {
                        let coinName = client.coins[i / commandsPerCoin | 0];
                        let coinStats = {
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
        }, function (err) {
            if (err) {
                logger.error(logSystem, 'Global', 'error getting all stats' + JSON.stringify(err));
                return callback();
            }

            let portalStats = {
                time: statGatherTime,
                global: {
                    workers: 0,
                    hashrate: 0,
                    payouts: 0
                },
                algos: {},
                pools: allCoinStats
            };

            let workerstats = [];
            let retentionTime = (((Date.now() / 1000) - portalConfig.website.stats.historicalRetention) | 0);

            Object.keys(allCoinStats).forEach(function (coin) {
                let coinStats = allCoinStats[coin];
                coinStats.workers = {};
                coinStats.shares = 0;
                coinStats.hashrates.forEach(function (ins) {
                    let parts = ins.split(':');
                    let workerShares = parseFloat(parts[0]);
                    let worker = parts[1];
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
                coinStats.payouts.forEach(function (pout) {
                    portalStats.global.payouts += parseFloat(pout);
                });

                let shareMultiplier = Math.pow(2, 32) / algos[coinStats.algorithm].multiplier;
                coinStats.hashrate = shareMultiplier * coinStats.shares / portalConfig.website.stats.hashrateWindow;
//                coinStats.difficulyy = shares;

                coinStats.workerCount = Object.keys(coinStats.workers).length;
                portalStats.global.workers += coinStats.workerCount;

                /* algorithm specific global stats */
                let algo = coinStats.algorithm;
                if (!portalStats.algos.hasOwnProperty(algo)) {
                    portalStats.algos[algo] = {
                        workers: 0,
                        hashrate: 0,
                        hashrateString: null
                    };
                }
                portalStats.algos[algo].hashrate += coinStats.hashrate;
                portalStats.algos[algo].workers += Object.keys(coinStats.workers).length;
                portalStats.global.hashrate += coinStats.hashrate;

                for (let worker in coinStats.workers) {
                    let hshares = shareMultiplier * coinStats.workers[worker].shares;
                    let hrate = shareMultiplier * coinStats.workers[worker].shares / portalConfig.website.stats.hashrateWindow;
                    let hratestring = _this.getReadableHashRateString(hrate);
                    coinStats.workers[worker].hashrateString = hratestring;
                    workerstats.push(['zadd', coin + ":workerStat:" + worker.toLowerCase(), statGatherTime, JSON.stringify({
                        time: statGatherTime,
                        hashrate: hrate,
                        hashratestring: hratestring,
                        shares: hshares
                    })]);
                    workerstats.push(['zremrangebyscore', coin + ":workerStat:" + worker.toLowerCase(), '-inf', '(' + retentionTime]);
                }

                delete coinStats.hashrates;
//                delete coinStats.shares;

                coinStats.hashrateString = _this.getReadableHashRateString(coinStats.hashrate);
            });

            redisStats.multi(workerstats).exec(function (err, replies) {
                if (err)
                    logger.error(logSystem, 'Historics', 'Error adding stats to historics ' + JSON.stringify(err));
            });

            Object.keys(portalStats.algos).forEach(function (algo) {
                let algoStats = portalStats.algos[algo];
                algoStats.hashrateString = _this.getReadableHashRateString(algoStats.hashrate);
            });

            portalStats.global.hours = Math.floor((Date.now() - new Date(2017, 8, 18).getTime()) / (60 * 60 * 1000));
            portalStats.global.hashrateString = _this.getReadableHashRateString(portalStats.global.hashrate);
            portalStats.global.payouts = Math.floor(Math.round(portalStats.global.payouts * 100)) / 100;
            _this.stats = portalStats;
            _this.statsString = JSON.stringify(portalStats);

            _this.statHistory.push(portalStats);
            addStatPoolHistory(portalStats);

            //let retentionTime = (((Date.now() / 1000) - portalConfig.website.stats.historicalRetention) | 0);

            for (let i = 0; i < _this.statHistory.length; i++) {
                if (retentionTime < _this.statHistory[i].time) {
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
            ]).exec(function (err, replies) {
                if (err)
                    logger.error(logSystem, 'Historics', 'Error adding stats to historics ' + JSON.stringify(err));
            });
            callback();
        });

    };

    this.getReadableHashRateString = function (hashrate) {
        let i = -1;
        let byteUnits = [' KH', ' MH', ' GH', ' TH', ' PH'];
        do {
            hashrate = hashrate / 1000;
            i++;
        } while (hashrate > 1000);
        return hashrate.toFixed(2) + byteUnits[i];
    };

    this.getPayoutStats = function (coin, callback) {
        let redisCommandTemplates = [
            ['hgetall', coin + ':payouts']
        ];

        redisStats.multi(redisCommandTemplates).exec(function (err, results) {
            callback(err, results[0]);
        });
    };

    this.getLiveStats = function (label, isworking, isdc, callback) {
        models.Farm.findAll({
            where: {name: {$like: '%' + label + '%'}, status: {$in: (isworking ? [1,2] : [0,1,2])}, is_dc: {$gte: isdc}},
            order: [['status', 'DESC'], ['name', 'ASC']],
            include: ['Stat']
        }).then(farms => {
            let result = [];
            async.waterfall([
                function (callback) {
                    let noStatFarms = [];
                    let counts = {
                        alerted: 0,
                        working: 0,
                        stopped: 0
                    };
                    farms.forEach(function (farm) {
                        result.push({
                            key: tools.createFarmKey(farm.name, farm.ip),
                            value: JSON.stringify({
                                Name: farm.name,
                                IP: farm.ip,
                                curcoin: farm.curcoin,
                                Stat: farm.Stat || {},
                                status: farm.status,
                                Time: farm.time,
                                upTime: farm.upTime,
                                Hash: crypto.createHmac('sha256', tools.createFarmKey(farm.name, farm.ip)).digest('hex')
                            })
                        });
                        switch(farm.status){
                            case 0:
                                ++counts.stopped;
                                break;
                            case 1:
                                ++counts.working;
                                break;
                            case 2:
                                ++counts.alerted;
                                break;
                        }
                        if (!farm.Stat)
                            noStatFarms.push({
                                label: tools.createFarmKey(farm.name, farm.ip),
                                name: farm.name,
                                curcoin: farm.curcoin
                            })
                    });
                    callback(null, result, noStatFarms, counts);
                }, function (result, noStatFarmArray, counts, callback) {
                    if (noStatFarmArray.length){
                        let addresult = {};
                        async.each(noStatFarmArray, function (farm, asyncCallback) {
                            redisStats.zrange(farm.curcoin + ":workerStat:" + farm.name, -1, -1, "withscores", function (err, results) {
                                if (!err && results.length > 0){
                                    let parsedResult = JSON.parse(results[0]);
                                    addresult[farm.label] = JSON.stringify({hashrate:parsedResult.hashrate});
                                }
                                asyncCallback()
                            })
                        }, function (err) {
                            callback(err, result, addresult, counts);
                        })
                    } else
                        callback(null, result, null, counts)
                }
            ], function (err, result, addresult, counts) {
                callback(err, result, addresult, counts);
            });
        });
    };

    this.getUserLiveStats = function (user, callback) {
        models.Farm.findAll({
            where: {name: {$like: user + '/%'}},
            order: [['status', 'DESC'], ['name', 'ASC']],
            include: ['Stat']
        }).then(farms => {
            let output = {};
            let result = {};
            let coins = _this.coinSetup.coins.map(obj => obj.coin);
            output.coinsSymbols = _this.coinSetup.coins.reduce(function(map, obj) {
                map[obj.coin] = obj.symbol;
                return map;
            }, {});
            async.waterfall([
                function (callback) {
                    let noStatFarms = [];
                    farms.forEach(function (farm) {
                        result[tools.createFarmKey(farm.name, farm.ip)] = JSON.stringify({
                            Name: farm.name,
                            IP: farm.ip,
                            curcoin: farm.curcoin,
                            Stat: farm.Stat || {},
                            status: farm.status,
                            Time: farm.time,
                            upTime: farm.upTime,
                            Hash: crypto.createHmac('sha256', tools.createFarmKey(farm.name, farm.ip)).digest('hex')
                        });
                        if (!farm.Stat)
                            noStatFarms.push({
                                label: tools.createFarmKey(farm.name, farm.ip),
                                name: farm.name,
                                curcoin: farm.curcoin
                            })
                    });
                    output.result = result;
                    output.coins = coins;
                    callback(null,noStatFarms);
                }, function (noStatFarmArray, callback) {
                    if (noStatFarmArray.length){
                        let addresult = {};
                        async.each(noStatFarmArray, function (farm, asyncCallback) {
                            redisStats.zrange(farm.curcoin + ":workerStat:" + farm.name, -1, -1, "withscores", function (err, results) {
                                if (!err && results.length > 0){
                                    let parsedResult = JSON.parse(results[0]);
                                    addresult[farm.label] = JSON.stringify({hashrate:parsedResult.hashrate});
                                }
                                asyncCallback()
                            })
                        }, function (err) {
                            output.addresult = addresult;
                            callback(err);
                        })
                    } else
                        callback()
                }, function (callback) {
                    models.NetStats.findOne({
                        order: [['time', 'DESC']]
                    }).then(netStat => {
                        if (netStat) {
                            output.blockTime = netStat.blockTime;
                            output.netHashrate = netStat.netHashrate;
                        }
                        callback();
                    })
                }
            ], function (err) {
                callback(!err ? output : null);
            });
        });
    };

    this.getFarm = function (label, callback) {
        let farmKey = tools.splitFarmLabel(label);
        models.Farm.findOne({where: {name: farmKey.name, ip: farmKey.ip}, include: ['Stat']}).then(farm => {
            if (!farm) return callback("No farm error", null);
            let result = {
                key: tools.createFarmKey(farm.name, farm.ip),
                value: JSON.stringify({
                    Name: farm.name,
                    IP: farm.ip,
                    curcoin: farm.curcoin,
                    Stat: farm.Stat || {},
                    status: farm.status,
                    Time: farm.time,
                    upTime: farm.upTime,
                    description: farm.description
                })
            };
            return callback(null, result);
        })
    };

    this.setFarm = function (label, description, callback) {
        let farmKey = tools.splitFarmLabel(label);
        models.Farm.findOne({where: {name: farmKey.name, ip: farmKey.ip}, include: ['Stat']}).then(farm => {
            if (!farm) return callback("No farm error", {error:"No farm error", result:null});
            farm.description = description;
            farm.save();
            return callback(null, {error:null, result:true});
        })
    };

    this.deleteFarm = function (username, worker, ip, callback) {
        models.Farm.findOne({where: {name: {$like: username + '/' + worker}, ip: ip, status: 0}}).then(farm => {
            if (!farm) return callback("You can`t delete this farm");
            else {
                farm.destroy();
                let label = username + '/' + worker + " [" + farm.ip + "]";
                Object.keys(poolConfigs).forEach(function (coin) {
                    redisStats.hdel(coin + ":liveStat", label);
                });
                redisStats.hdel("summary:liveStat", label);
            }
            return callback("Your command will be completing soon");
        })
    };

    this.disableAlert = function (username, worker, callback) {
        models.Farm.findAll({where: {name: { $or: {$like: username + '/' + worker, $eq: username} }, status: 2}}).then(farms => {
            if (farms.length === 0) return callback("You can`t disable this farm");
            else {
                farms.forEach(function (farm) {
                    farm.status = 0;
                    farm.save();
                });
                let label = (username + '/' + worker).toLowerCase();
                Object.keys(poolConfigs).forEach(function (coin) {
                    redisStats.hscan(coin + ":liveStat", 0, 'match', label + " *", 'count', '1000', function (err, results) {
                        if (!err && results && results[1].length > 1) {
                            for (let a = 0; a < results[1].length; a += 2) {
                                let curstat = JSON.parse(results[1][a + 1]);
                                if (label === curstat.Name.toLowerCase()) {
                                    curstat.status = 0;
                                    redisStats.hset(coin + ":liveStat", results[1][a], JSON.stringify(curstat));
                                }
                            }
                        }
                    })
                });
                redisStats.hscan("summary:liveStat", 0, 'match', label + " *", 'count', '1000', function (err, results) {
                    if (!err && results && results[1].length > 1) {
                        for (let a = 0; a < results[1].length; a += 2) {
                            let curstat = JSON.parse(results[1][a + 1]);
                            if (label === curstat.Name.toLowerCase()) {
                                curstat.status = 0;
                                redisStats.hset("summary:liveStat", results[1][a], JSON.stringify(curstat));
                            }
                        }
                    }
                });
            }
            return callback("Your command will be completing soon");
        })
    };

    this.stopFarm = function (username, worker, callback) {
        models.Farm.findAll({where: {name: {$like: username + '/' + worker}, status: {$in: [1, 2]}}}).then(farms => {
            if (farms.length === 0) return callback("You can`t stop this farm");
            else {
                let label = (username + '/' + worker).toLowerCase();
                Object.keys(poolConfigs).forEach(function (coin) {
                    redisStats.hscan(coin + ":liveStat", 0, 'match', label + " *", 'count', '1000', function (err, results) {
                        if (!err && results && results[1].length > 1) {
                            for (let a = 0; a < results[1].length; a += 2) {
                                let curstat = JSON.parse(results[1][a + 1]);
                                if (label === curstat.Name.toLowerCase()) {
                                    curstat.is_stoped = 1;
                                    redisStats.hset(coin + ":liveStat", results[1][a], JSON.stringify(curstat));
                                }
                            }
                        }
                    })
                });
                redisStats.hscan("summary:liveStat", 0, 'match', label + " *", 'count', '1000', function (err, results) {
                    if (!err && results && results[1].length > 1) {
                        for (let a = 0; a < results[1].length; a += 2) {
                            let curstat = JSON.parse(results[1][a + 1]);
                            if (label === curstat.Name.toLowerCase()) {
                                curstat.is_stoped = 1;
                                redisStats.hset("summary:liveStat", results[1][a], JSON.stringify(curstat));
                            }
                        }
                    }
                });
            }
            return callback("Your command will be completing soon");
        })
    };

    this.startFarm = function (username, worker, callback) {
        models.Farm.findAll({where: {name: {$like: username + '/' + worker}, status: {$in: [1, 2]}}}).then(farms => {
            if (farms.length === 0) return callback("You can`t start this farm");
            else {
                let label = (username + '/' + worker).toLowerCase();
                Object.keys(poolConfigs).forEach(function (coin) {
                    redisStats.hscan(coin + ":liveStat", 0, 'match', label + " *", 'count', '1000', function (err, results) {
                        if (!err && results && results[1].length > 1) {
                            for (let a = 0; a < results[1].length; a += 2) {
                                let curstat = JSON.parse(results[1][a + 1]);
                                if (label === curstat.Name.toLowerCase()) {
                                    curstat.is_stoped = 0;
                                    redisStats.hset(coin + ":liveStat", results[1][a], JSON.stringify(curstat));
                                }
                            }
                        }
                    })
                });
                redisStats.hscan("summary:liveStat", 0, 'match', label + " *", 'count', '1000', function (err, results) {
                    if (!err && results && results[1].length > 1) {
                        for (let a = 0; a < results[1].length; a += 2) {
                            let curstat = JSON.parse(results[1][a + 1]);
                            if (label === curstat.Name.toLowerCase()) {
                                curstat.is_stoped = 0;
                                redisStats.hset("summary:liveStat", results[1][a], JSON.stringify(curstat));
                            }
                        }
                    }
                });
            }
            return callback("Your command will be completing soon");
        })
    };

    this.setWorkerIPLiveStats = function (coin, worker, time, stat, callback) {
        if (worker.length === 0) {
            return callback({error: "No stat. No worker error.", result: null});
        }
        redisStats.hscan(coin + ":liveStat", 0, 'match', worker.toLowerCase() + " *", 'count', '1000', function (err, results) {
            if (err || results === null) {
                return callback({error: "No stat. Redis request error.", result: null});
            }
            if (results[1].length > 1) {
                for (let a = 0; a < results[1].length; a += 2) {

                    let userstat = JSON.parse(results[1][a + 1]);
                    if (worker.toLowerCase() === userstat.Name.toLowerCase()) {
                        userstat.Stat = stat;
                        userstat.statTime = time || Date.now();
                        redisStats.hset(coin + ":liveStat", results[1][a], JSON.stringify(userstat), function (err, results) {
                        });
                        return callback({error: null, result: true});
                    }
                }
                callback({error: "No stat. No worker error.", result: null});
            } else {
                callback({error: "No stat. No worker error.", result: null});
            }
        });
    };

    this.regWorkerLiveStats = function (coin, client, clienthash, callback) {
        redisStats.hget(coin + ':liveStat', client.label.toLowerCase(), function (err, result) {
            if (!err && result) {
                let curstat = JSON.parse(result);
                client.stat = curstat.Stat;
                client.avgStat = curstat.avgStat;
                client.warningtimes = curstat.warningtimes;
                client.statTime = curstat.statTime;
                client.upTime = curstat.status !== 1 ? Date.now() : curstat.upTime;
                client.status = 1;
                client.is_stoped = curstat.is_stoped === 1 && Date.now() - curstat.Time < 10 * 60 * 1000 ? 0 : curstat.is_stoped;
            }
            redisStats.hset(coin + ':liveStat', client.label.toLowerCase(),
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
                    "is_dc": 1
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
            callback({err: null, result: true});
        });
    };

    this.getUserHistoryStats = function (user, callback) {
        let windowTime = (((Date.now() / 1000) - portalConfig.website.stats.hashrateWindow * 30) | 0).toString();
        //aggregate all coins in one statistic
        let farmmask = "*:workerStat:" + user + "*";
        redisStats.keys(farmmask, function (err, results) {
            let q = {};
            let rdone = 0;

            let totalhashrate = {};
            let totalshares = {};


            let getstat = function (x) {
                redisStats.zremrangebyscore(results[x], '-inf', '(' + windowTime, function (err, result1) {
                    redisStats.zrangebyscore(results[x], windowTime, '+inf', function (err, result) {
//                        let curdata = JSON.parse(result);
                        result.forEach(function (qx) {
                            let x = JSON.parse(qx);

                            if (typeof x.time != 'undefined') {
                                if (typeof totalhashrate[x.time] == 'undefined') totalhashrate[x.time] = {
                                    Time: x.time * 1000,
                                    hashrate: 0,
                                    shares: 0
                                };
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

    this.getConnectionLiveStats = function (digest, callback) {
        let windowTime = (((Date.now() / 1000) - portalConfig.website.stats.hashrateWindow * 30) | 0).toString();

        let clienthash = digest;

        let farmmask = "*:liveStat:" + clienthash;
        redisStats.keys(farmmask, function (err, results) {
            let resultArray = [];
            let getstat = function (x) {
                redisStats.zrangebyscore(results[x], windowTime, "+Inf", function (err, result) {
                    resultArray = resultArray.concat(result);
                    if (x + 1 < results.length) getstat(x + 1);
                    else callback(resultArray);
                });
            };
            if (results.length > 0) getstat(0);
        });
    };

    this.recoverUser = function (login, callback) {
        if (!login) return callback({result: null, error: "Not all data set"});
        models.User.findOne({where: {name: login}}).then(user => {
            if (!user) return callback({result: null, error: "No such user"});
            else if (user.telegram === '') return callback({
                result: null,
                error: "Telegram not connected. Recovery impossible"
            });
            else {
                models.Recovercode.create({user_id: user.id, code: uuid(), time: Date.now()});
                callback({result: true, error: null});
            }
        })
    };

    this.resetPassword = function (reccode, password, callback) {
        if (!password) return callback({result: null, error: "Not all data set"});
        models.Recovercode.findOne({
            where: {
                is_send: 1,
                code: reccode,
                time: {$gte: Date.now() - 6 * 60 * 1000}
            }
        }).then(code => {
            if (!code) return callback({result: null, error: "Link has expired"});
            else {
                models.User.findById(code.user_id).then(user => {
                    if (!user) return callback({result: null, error: "Broken link"});
                    else {
                        user.password = tools.hidePwd(password);
                        user.save();
                        return callback({result: true, error: null, user_id: user.id});
                    }
                })
            }
        });
    };

    this.registerUser = function (login, password, refcode, callback) {
        if (!login || !password) return callback({result: null, error: "Not all data set"});
        models.User.findOne({where: {name: login}}).then(user => {
            if (user) {
                return callback({result: null, error: "User already registered"});
            } else {
                models.User.create({
                    name: login,
                    password: tools.hidePwd(password),
                    referralcode: tools.hidePwd(login)
                }).then(created => {
                    if (refcode && refcode.length > 0) {
                        /*
                         Refferal program
                         */
                        models.User.findOne({where: {referralcode: refcode}}).then(user => {
                            if (user) {
                                models.Upayoffs.create({
                                    recipient: user.name,
                                    percent: portalConfig.referralPercent,
                                    subject: portalConfig.referralPercent * 100 + "%: " + 'referral payment',
                                    user_id: created.id
                                });
                                /*
                                 Base pool commission
                                 TODO: refactor for multiple coins
                                 */
                                models.Upayoffs.create({
                                    recipient: 'poolowner',
                                    percent: poolConfigs['ethereum'].rewardRecipients['poolowner'].percent - portalConfig.referralPercent,
                                    subject: Math.floor((poolConfigs['ethereum'].rewardRecipients['poolowner'].percent - portalConfig.referralPercent) * 100 * 100) / 100 + "%: " + 'pool fee',
                                    user_id: created.id
                                });
                                return callback({result: true, error: null, user_id: created.id});
                            } else {
                                created.destroy();
                                return callback({result: null, error: "Wrong referral code"});
                            }
                        });
                    } else {
                        /*
                         Base pool commission
                         TODO: refactor for multiple coins
                         */
                        models.Upayoffs.create({
                            recipient: 'poolowner',
                            percent: poolConfigs['ethereum'].rewardRecipients['poolowner'].percent,
                            subject: poolConfigs['ethereum'].rewardRecipients['poolowner'].percent * 100 + "%: " + 'pool fee',
                            user_id: created.id
                        });
                        return callback({result: true, error: null, user_id: created.id});
                    }
                }).catch(error => {
                    return callback({result: null, error: "User already registered"});
                });
            }
        })
    };

    this.loginUser = function (login, password, confcode, callback) {
        models.User.findOne({where: {name: login}, include: ['Settings']}).then(user => {
            if (user === null) {
                return callback({result: null, error: "No such user", conf: false});
            }
            if (tools.hidePwd(password) !== user.password) {
                return callback({result: null, error: "Incorrect password", conf: false});
            }
            if (confcode === 'wo') {
                return callback({
                    result: true,
                    error: null,
                    conf: false,
                    user: {id: user.id, name: user.name, telegram: user.telegram}
                });
            }
            let tfauth = user.Settings.find(el => el.name === 'tfauth');
            let confirmed = false;
            switch (tfauth ? tfauth.value : "none") {
                case 'telegram': {
                    if (confcode === 'new' || Date.now() - user.lConfirmationSendTime > 2 * 60 * 1000) {
                        user.lConfirmationSendTime = Date.now();
                        user.save();
                        models.Confcode.create({
                            user_id: user.id,
                            code: tools.generateCode(),
                            time: user.lConfirmationSendTime
                        });
                        return callback({
                            result: null,
                            error: "New confirmation code sending to yours telegram",
                            conf: true
                        });
                    } else {
                        models.Confcode.findOne({
                            where: {
                                user_id: user.id,
                                is_send: 1,
                                time: user.lConfirmationSendTime
                            }
                        }).then(sended_code => {
                            if (!sended_code) {
                                return callback({result: null, error: "Wrong confirmation code", conf: true});
                            }
                            if (sended_code.code !== confcode) {
                                callback({result: null, error: "Wrong confirmation code", conf: true});
                            } else {
                                user.lConfirmationSendTime = 0;
                                user.save();

                                callback({
                                    result: true,
                                    error: null,
                                    conf: true,
                                    user: {id: user.id, name: user.name, telegram: user.telegram}
                                });
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
                    return callback({result: null, error: "Db error", conf: false});
                }
            }
            if (confirmed) {
                callback({
                    result: true,
                    error: null,
                    conf: false,
                    user: {id: user.id, name: user.name, telegram: user.telegram}
                });
            }
        })
    };

    this.getUserInfo = function (login, password, callback) {
        models.User.findOne({where: {name: login}, include: ['Settings', 'Wallets']}).then(user => {
            if (!user) {
                return callback({result: null, error: "No such user"});
            }
            if (password !== user.password) {
                return callback({result: null, error: "Incorrect password"});
            }
            callback({
                result: {
                    name: user.name,
                    wallets: tools.settingsArrayToMap(user.Wallets),
                    telegram: user.telegram,
                    settings: tools.settingsArrayToMap(user.Settings),
                    refcode: user.referralcode
                }, error: null
            });
        });
    };

    this.getTelegramUsers = function (callback) {
        models.User.findAll({where: {telegram: {$ne: ''}}}).then(users => {
            if (users.length === 0) {
                return callback("No such users", null);
            }
            let telegramUsers = [];
            users.forEach(function (user) {
                telegramUsers.push({
                    name: user.name,
                    userdata: {id: user.id, telegram: user.telegram, name: user.name, pass: user.password}
                });
            });

            callback(null, telegramUsers);
        });
    };

    this.getUsers = function (username, page, sort, order, callback) {
        models.User.findAndCountAll({
            where: {name: {$like: '%' + username + '%'}},
            order: [[sort, order]],
            distinct: true,
            limit: 10,
            offset: (page - 1) * 10,
            include: [
                {association: 'Wallets', required: false, separate: true, limit:100},
                {association: 'Payoffs', required: false, separate: true, limit:100}
            ],
            attributes: {
                include: [
                    [models.sequelize.literal('ifnull((select value from ubalance where name = User.name and coin = "ethereum"),0)'), 'balance'],
                    [models.sequelize.literal('ifnull((select sum(value) from payouts where name = User.name and coin = "ethereum" and status in (0,1)),0)'), 'payments'],
                    [models.sequelize.literal('ifnull((select value from sharebalance where user = User.name and coin = "ethereum"),0)'), 'sharebalance']
                ]
            }
        }).then(result => {
            let users = result.rows;
            if (users.length === 0) {
                return callback(null, {dataArray: [], datacount: result.count, error: null});
            }
            let resultUsers = [];
            users.forEach(function (user) {
                resultUsers.push({
                    name: user.name,
                    userdata: {
                        id: user.id,
                        telegram: user.telegram,
                        name: user.name,
                        Wallets: user.Wallets,
                        Payoffs: user.Payoffs,
                        curbalance: parseFloat(user.getDataValue('balance')) + parseFloat(user.getDataValue('payments')) + parseFloat(user.getDataValue('sharebalance'))
                    }
                });
            });

            callback(null, {dataArray: resultUsers, datacount: result.count, error: null});
        });
    };

    this.getUser = function (uname, callback) {
        models.User.findOne({where: {name: uname}, include: ['Wallets', 'Payoffs']}).then(user => {
            if (!user) {
                return callback(null, {user: null, error: null});
            }

            callback(null, {
                user: {
                    name: user.name,
                    userdata: {
                        id: user.id,
                        telegram: user.telegram,
                        name: user.name,
                        Wallets: user.Wallets,
                        Payoffs: user.Payoffs
                    }
                }, error: null
            });
        });
    };

    this.addPayoff = function (uname, recipient, percent, subject, callback) {
        if (!recipient) {
            return callback(null, {result: false, error: "Empty recipient"});
        }
        models.User.findOne({where: {name: uname}}).then(user => {
            if (!user) {
                return callback(null, {result: false, error: "No such user"});
            }

            models.Upayoffs.findOrCreate({
                where: {
                    recipient: recipient,
                    user_id: user.id
                }
            }).spread((payoff, created) => {
                payoff.percent = parseFloat((percent || 0).replace(/,/gi, '.'));
                payoff.subject = payoff.percent * 100 + "%: " + subject;
                payoff.save();
                callback(null, {result: true, error: null});
            })
        });
    };

    this.deletePayoff = function (uname, recipient, callback) {
        if (!recipient) {
            return callback(null, {result: false, error: "Empty recipient"});
        }
        models.User.findOne({where: {name: uname}}).then(user => {
            if (!user) {
                return callback(null, {result: false, error: "No such user"});
            }

            models.Upayoffs.destroy({where: {recipient: recipient, user_id: user.id}}).then(() => {
                return callback(null, {result: true, error: null});
            })
        });
    };

    this.getUserTelegram = function (clientname, callback) {
        models.User.findOne({where: {name: clientname}}).then(user => {
            if (!user) {
                return callback(null, "No such user");
            }
            if (user.telegram === '') {
                return callback(null, "Unregistered telegram");
            }

            callback({telegram: user.telegram}, null);
        })
    };

    this.getUserBalance = function (login, password, callback) {
        models.User.findOne({where: {name: login}, include: ['Shares']}).then(user => {
            if (!user) {
                return callback({result: null, error: "No such user"});
            }
            if (password !== user.password) {
                return callback({result: null, error: "Incorrect password"});
            }
            let balances = {};
            async.each(Object.keys(poolConfigs), function (coin, asyncCallback) {
                async.waterfall([
                    function (callback) {
                        let share = user.Shares.find(el => el.coin === coin);
                        balances[coin] = {
                            balance: 0,
                            balanceshare: parseFloat(share ? share.value : 0),
                            shares: parseFloat(share ? share.shares : 0),
                            percents: parseFloat(share ? share.percents : 0),
                            sym: poolConfigs[coin].coin.symbol
                        };
                        callback();
                    }, function (callback) {
                        models.Payouts.findAll({
                            where: {
                                name: user.name,
                                coin: coin,
                                status: {$in: [0, 1, 2]}
                            }
                        }).then(payouts => {
                            balances[coin].payouts = 0;
                            balances[coin].payments = 0;
                            payouts.forEach(function (payout) {
                                if (payout.status !== 2) {
                                    balances[coin].balance += parseFloat(payout.value);
                                    balances[coin].payouts += parseFloat(payout.value);
                                } else {
                                    balances[coin].payments += parseFloat(payout.value);
                                }
                            });
                            callback();
                        })
                    }, function (callback) {
                        models.Ubalance.findOne({where: {name: user.name, coin: coin}}).then(balance => {
                            if (balance) balances[coin].balance += parseFloat(balance.value);
                            callback();
                        })
                    },
                    function (callback) {
                        models.Rates.findAll({
                            where: {coin: coin, code: 'USD'},
                            order: [['time', 'DESC']],
                            limit: 1
                        }).then(rate => {
                            if (rate.length > 0) {
                                balances[coin].usdRate = parseFloat(rate[0].value);
                                balances[coin].usdCode = rate[0].code;
                            }
                            callback();
                        })
                    },
                    function (callback) {
                        models.Rates.findAll({
                            where: {coin: coin, code: 'RUB'},
                            order: [['time', 'DESC']],
                            limit: 1
                        }).then(rate => {
                            if (rate.length > 0) {
                                balances[coin].rubRate = parseFloat(rate[0].value);
                                balances[coin].rubCode = rate[0].code;
                            }
                            callback();
                        })
                    }
                ], function (err) {
                    asyncCallback(err);
                });
            }, function (err, result) {
                callback({result: !err ? {balance: balances} : null, error: err});
            });
        });
    };

    this.addWallet = function (login, password, wallets, settings, confcode, callback) {
        models.User.findOne({where: {name: login}, include: ['Settings', 'Wallets']}).then(user => {
            if (user === null) {
                return callback({result: null, error: "No such user", conf: false});
            }
            if (password !== user.password) {
                return callback({result: null, error: "Incorrect password", conf: false});
            }
            let coinErr = Object.keys(settings).find(coin => poolConfigs[coin].paymentProcessing.displayMinimumPayment > (parseFloat(settings[coin].replace(/,/gi, '.')) || poolConfigs[coin].paymentProcessing.displayMinimumPayment));
            if (coinErr) return callback({
                result: null,
                error: "Сумма минимальной выплаты для " + coinErr + " меньше минимального значения",
                conf: false
            });

            let tfauth = user.Settings.find(el => el.name === 'tfauth');
            let confirmed = false;
            switch (tfauth ? tfauth.value : "none") {
                case 'telegram': {
                    if (confcode === 'new' || Date.now() - user.wConfirmationSendTime > 2 * 60 * 1000) {
                        user.wConfirmationSendTime = Date.now();
                        user.save();
                        models.Confcode.create({
                            user_id: user.id,
                            code: tools.generateCode(),
                            time: user.wConfirmationSendTime
                        });
                        return callback({
                            result: null,
                            error: "New confirmation code sending to yours telegram",
                            conf: true
                        });
                    } else {
                        models.Confcode.findOne({
                            where: {
                                user_id: user.id,
                                is_send: 1,
                                time: user.wConfirmationSendTime
                            }
                        }).then(sended_code => {
                            if (!sended_code) {
                                return callback({result: null, error: "Wrong confirmation code", conf: true});
                            }
                            if (sended_code.code !== confcode) {
                                callback({result: null, error: "Wrong confirmation code", conf: true});
                            } else {
                                user.wConfirmationSendTime = 0;
                                Object.keys(wallets).forEach(function (coin) {
                                    let wallet = user.Wallets.find(el => el.name === coin);
                                    if (wallet) {
                                        wallet.value = wallets[coin] ? wallets[coin].trim() : '';
                                        wallet.save()
                                    } else {
                                        models.Uwallets.create({
                                            user_id: user.id,
                                            name: coin,
                                            value: wallets[coin] ? wallets[coin].trim() : ''
                                        })
                                    }
                                });
                                Object.keys(settings).forEach(function (coin) {
                                    let setting = user.Settings.find(el => el.name === "minpayments_" + coin.replace(/\s/gi, ''));
                                    if (setting) {
                                        setting.value = parseFloat(settings[coin].replace(/,/gi, '.')) || poolConfigs[coin].paymentProcessing.displayMinimumPayment;
                                        setting.save()
                                    } else {
                                        models.Usettings.create({
                                            user_id: user.id,
                                            name: "minpayments_" + coin.replace(/\s/gi, ''),
                                            value: parseFloat(settings[coin].replace(/,/gi, '.')) || poolConfigs[coin].paymentProcessing.displayMinimumPayment
                                        })
                                    }
                                });
                                user.save();

                                callback({result: true, error: null, conf: true});
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
                    return callback({result: null, error: "Db error", conf: false});
                }
            }
            if (confirmed) {
                Object.keys(wallets).forEach(function (coin) {
                    let wallet = user.Wallets.find(el => el.name === coin);
                    if (wallet) {
                        wallet.value = wallets[coin] ? wallets[coin].trim() : '';
                        wallet.save()
                    } else {
                        models.Uwallets.create({
                            user_id: user.id,
                            name: coin,
                            value: wallets[coin] ? wallets[coin].trim() : ''
                        })
                    }
                });
                Object.keys(settings).forEach(function (coin) {
                    let setting = user.Settings.find(el => el.name === "minpayments_" + coin.replace(/\s/gi, ''));
                    if (setting) {
                        setting.value = parseFloat(settings[coin].replace(/,/gi, '.')) || poolConfigs[coin].paymentProcessing.displayMinimumPayment;
                        setting.save()
                    } else {
                        models.Usettings.create({
                            user_id: user.id,
                            name: "minpayments_" + coin.replace(/\s/gi, ''),
                            value: parseFloat(settings[coin].replace(/,/gi, '.')) || poolConfigs[coin].paymentProcessing.displayMinimumPayment
                        })
                    }
                });

                callback({result: true, error: null, conf: false});
            }
        })
    };

    this.addTelegram = function (login, password, telegram, callback) {
        models.User.findOne({where: {name: login}}).then(user => {
            if (user === null) {
                return callback({result: null, error: "No such user"});
            }
            if (password !== user.password) {
                return callback({result: null, error: "Incorrect password"});
            }
            user.telegram = telegram;
            user.save();

            callback({result: true, error: null});
        })
    };

    this.getUserFarms = function (login, password, farmName, callback) {
        models.User.findOne({where: {name: login}}).then(user => {
            if (user === null) {
                return callback({dataArray: null, error: "No such user"});
            }
            if (password !== user.password) {
                return callback({dataArray: null, error: "Incorrect password"});
            }
            models.Farm.findAll({where: {name: {$like: user.name + '%'}}}).then(farms => {
                let dataArray = [];
                farms.forEach(function (farm) {
                    dataArray.push(farm.name.substr(farm.name.indexOf("/") + 1, farm.name.length));
                });
                callback({dataArray: dataArray, error: null});
            })
        })
    };

    this.getFarmlist = function (callback) {
        models.Farm.findAll().then(farms => {
            let dataArray = [];
            farms.forEach(function (farm) {
                dataArray.push(tools.parseName(farm.name));
            });
            callback({dataArray: dataArray, error: null});
        })
    };

    this.addSysMessage = function (username, worker, message, callback) {
        models.User.findOne({where: {name: username}}).then(user => {
            if (!user) return callback("Access error.");
            let parsedmessage = JSON.parse(message);
            models.Umessages.findOrCreate({
                where: {
                    user_id: user.id,
                    farm: username + '/' + worker,
                    cmd: parsedmessage.cmd,
                    sendedAt: 0
                }
            }).spread((message, created) => {
                if (!created && message.createdAt >= Date.now() - 5 * 60 * 1000) {
                    return callback("Already in the queue.");
                }
                message.params = JSON.stringify(parsedmessage.params);
                message.createdAt = Date.now();
                message.save();
                return callback("Your command will be completing soon");
            })
        })
    };

    this.getNewMessages = function (login, callback) {
        models.Umessages.findAll({
            where: {
                farm: login,
                createdAt: {$gte: Date.now() - 5 * 60 * 1000},
                sendedAt: 0
            }
        }).then(messages => {
            if (messages.length === 0) return callback({messages: [], login: login});
            let messageArray = [];
            messages.forEach(function (message) {
                messageArray.push({cmd: message.cmd, params: JSON.parse(message.params)});
                message.sendedAt = Date.now();
                message.save()
            });
            callback({messages: messageArray, login: login});
        })
    };

    this.loginAdmin = function (login, password, callback) {
        models.Admin.findOne({where: {name: login}}).then(admin => {
            if (admin === null) {
                return callback({result: null, error: "No such admin"});
            }
            if (tools.hidePwd(password) !== admin.password) {
                return callback({result: null, error: "Incorrect password"});
            }
            callback({result: true, error: null, adm: {id: admin.id, name: admin.name, telegram: admin.telegram}});
        })
    };

    this.setAdminTelegram = function (login, password, telegram, callback) {
        models.Admin.findOne({where: {name: login}}).then(admin => {
            if (admin === null) {
                return callback({result: null, error: "No such admin"});
            }
            if (tools.hidePwd(password) !== admin.password) {
                return callback({result: null, error: "Incorrect password"});
            }
            admin.telegram = telegram;
            admin.save();

            callback({result: true, error: null});
        })
    };

    this.getAdminTelegrams = function (callback) {
        models.Admin.findAll({where: {telegram: {$ne: ''}}}).then(admins => {
            if (admins.length === 0) {
                return callback(null, "No such admins");
            }
            let telegramAdmins = [];
            admins.forEach(function (admin) {
                telegramAdmins.push(admin.telegram);
            });

            callback(telegramAdmins, null);
        })
    };

    this.getNewConfirmationCodes = function (userdata, callback) {
        models.Confcode.findAll({where: {is_send: 0, user_id: userdata.id}}).then(codes => {
            if (codes.length === 0) {
                return callback([]);
            }
            let codesforsend = [];
            codes.forEach(function (code) {
                codesforsend.push(code.code);
                code.is_send = 1;
                code.save()
            });
            callback(codesforsend);
        })
    };

    this.getNewRecoverCodes = function (userdata, callback) {
        models.Recovercode.findAll({where: {is_send: 0, user_id: userdata.id}}).then(codes => {
            if (codes.length === 0) {
                return callback([]);
            }
            let codesforsend = [];
            codes.forEach(function (code) {
                codesforsend.push(code.code);
                code.is_send = 1;
                code.save()
            });
            callback(codesforsend);
        })
    };

    this.getRecoverCode = function (code, callback) {
        let t = Date.now() - 5 * 60 * 1000;
        models.Recovercode.findOne({
            where: {
                is_send: 1,
                code: code,
                time: {$gte: Date.now() - 5 * 60 * 1000}
            }
        }).then(code => {
            callback(null, code);
        })
    };

    this.getNewPaymentsNotice = function (userdata, callback) {
        models.Payments.findAll({
            where: {
                is_notice: 0,
                user: userdata.name,
                time: {$gte: Date.now() - 1 * 60 * 1000}
            }
        }).then(payments => {
            if (payments.length === 0) {
                return callback("No new payments", []);
            }
            payments.forEach(function (payment) {
                payment.is_notice = 1;
                payment.save()
            });
            callback(null, payments);
        })
    };

    this.checkCoinSwitchAccess = function (login, password, names, coin, callback) {
        models.User.findOne({where: {name: login}}).then(user => {
            if (user === null) {
                return callback(false);
            }
            if (password !== user.password) {
                return callback(false);
            }
            if (login.toLowerCase() !== names[0].toLowerCase()) return callback(false);
            models.Farm.findAll({where: {name: {$like: user.name + '%'}}}).then(farms => {
                let access = false;
                farms.forEach(function (farm) {
                    if (farm.name.substr(farm.name.indexOf("/") + 1, farm.name.length) === names[1] && farm.curcoin !== coin) {
                        access = true;
                    }
                });
                return callback(access);
            })
        })
    };

    this.checkBaseCommandAccess = function (login, password, names, callback) {
        models.User.findOne({where: {name: login}}).then(user => {
            if (user === null) {
                return callback(false);
            }
            if (password !== user.password) {
                return callback(false);
            }
            if (login.toLowerCase() !== names[0].toLowerCase()) return callback(false);
            models.Farm.findAll({where: {name: {$like: user.name + '/%'}}}).then(farms => {
                let access = false;
                farms.forEach(function (farm) {
                    if (farm.name.substr(farm.name.indexOf("/") + 1, farm.name.length) === names[1]) {
                        access = true;
                    }
                });
                return callback(access);
            })
        })
    };

    this.getUserPayouts = function (login, password, coin, callback) {
        models.User.findOne({
            where: {name: login},
            include: [{association: 'Payments', where: {coin: coin}, required: false, include: ['transaction']}],
            order: [['Payments', 'time', 'DESC']]
        }).then(user => {
            if (user === null) {
                return callback({error: "No user", dataArray: null});
            }
            if (password !== user.password) {
                return callback({error: "Access error", dataArray: null});
            }
            return callback({error: null, dataArray: user.Payments});
        })
    };

    this.updateUserSettings = function (login, password, settings, confcode, callback) {
        models.User.findOne({where: {name: login}, include: ['Settings']}).then(user => {
            if (user === null) {
                return callback({result: null, error: "No such user", conf: false});
            }
            if (password !== user.password) {
                return callback({result: null, error: "Incorrect password", conf: false});
            }
            if (settings['tfauth'] !== 'none' && user.telegram === '') {
                return callback({result: null, error: "Telegram is not connected", conf: false});
            }
            let tfauth = user.Settings.find(el => el.name === 'tfauth');
            let confirmed = false;
            switch (tfauth ? tfauth.value : "none") {
                case 'telegram': {
                    if (confcode === 'new' || Date.now() - user.sConfirmationSendTime > 2 * 60 * 1000) {
                        user.sConfirmationSendTime = Date.now();
                        user.save();
                        models.Confcode.create({
                            user_id: user.id,
                            code: tools.generateCode(),
                            time: user.sConfirmationSendTime
                        });
                        return callback({
                            result: null,
                            error: "New confirmation code sending to yours telegram",
                            conf: true
                        });
                    } else {
                        models.Confcode.findOne({
                            where: {
                                user_id: user.id,
                                is_send: 1,
                                time: user.sConfirmationSendTime
                            }
                        }).then(sended_code => {
                            if (!sended_code) {
                                return callback({result: null, error: "Wrong confirmation code", conf: true});
                            }
                            if (sended_code.code !== confcode) {
                                callback({result: null, error: "Wrong confirmation code", conf: true});
                            } else {
                                user.sConfirmationSendTime = 0;
                                Object.keys(settings).forEach(function (parameter) {
                                    let setting = user.Settings.find(el => el.name === parameter);
                                    if (setting) {
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

                                callback({result: true, error: null, conf: true});
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
                    return callback({result: null, error: "Db error", conf: false});
                }
            }
            if (confirmed) {
                Object.keys(settings).forEach(function (parameter) {
                    let setting = user.Settings.find(el => el.name === parameter);
                    if (setting) {
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

                callback({result: true, error: null, conf: false});
            }
        })
    };

    this.getUserLastPayouts = function (login, password, callback) {
        models.User.findOne({
            where: {name: login},
            include: [{association: 'Payments', required: false, include: ['transaction']}],
            order: [['Payments', 'time', 'DESC']]
        }).then(user => {
            if (user === null) {
                return callback({error: "No user", dataArray: null});
            }
            if (password !== user.password) {
                return callback({error: "Access error", dataArray: null});
            }
            /*
             f`kin sequelize`s bug with limit forces me to use array.slice
             */
            return callback({error: null, dataArray: user.Payments.slice(0, 5)});
        })
    };

    this.getUserCommissions = function (login, password, coin, callback) {
        models.User.findOne({where: {name: login}, include: ['Payoffs']}).then(user => {
            let result = {payoffs: []};
            let specialPercents = 0;
            if (user) {
                user.Payoffs.forEach(function (payoff) {
                    result.payoffs.push({
                        to: payoff.recipient,
                        subject: payoff.subject
                    });
                    if (payoff.recipient !== 'poolowner' && payoff.recipient !== 'datacenter') {
                        specialPercents += payoff.percent
                    }
                });
            }
            if (Object.keys(poolConfigs[coin].rewardRecipients).indexOf(user.name) === -1) {
                Object.keys(poolConfigs[coin].rewardRecipients).forEach(function (r) {
                    if (!result.payoffs.find(el => el.to === r)) {
                        poolConfigs[coin].rewardRecipients[r].from.forEach(function (x) {
                            if (x === "*" || x === user.name) {
                                let computedPercent = poolConfigs[coin].rewardRecipients[r].percent;
                                if (r === 'poolowner') {
                                    computedPercent -= specialPercents
                                }
                                if (computedPercent > 0) {
                                    result.payoffs.push({
                                        to: r,
                                        subject: poolConfigs[coin].rewardRecipients[r].subject + ' ' + Math.floor(computedPercent * 100 * 100) / 100 + '%'
                                    });
                                }
                            }
                        });
                    }
                });
            }
            return callback({error: null, dataArray: result.payoffs});
        });
    };

    this.dumpHistory = function () {
        let retentionTime = (((Date.now() / 1000) - portalConfig.website.stats.historicalRetention) | 0).toString();
        redisStats.keys("*:liveStat:*", function (err, results) {
            let getstat = function (x) {
                redisStats.zrangebyscore(results[x], "-Inf", "(" + retentionTime, function (err, result) {
                    let curcoin = results[x].split(':')[0];
                    result.forEach(function (res) {
                        let stat = JSON.parse(res);
                        models.Historyfarm.findOrCreate({
                            where: {
                                name: stat.Name,
                                ip: stat.IP,
                                coin: curcoin
                            }
                        }).spread((farm, created) => {
                            let t = Object.keys(stat.Stat).length;
                            if (Object.keys(stat.Stat).length === 4) {
                                models.Historystat.findOrCreate({
                                    where: {
                                        farm_id: farm.id,
                                        time: stat.Time
                                    }
                                }).spread((historystat, statcreated) => {
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
            let clearstat = function (x) {
                redisStats.zremrangebyscore(results[x], "-Inf", "(" + retentionTime, function (err, result) {
                });
            };
            if (results.length > 0) getstat(0);
        });
    }
};
