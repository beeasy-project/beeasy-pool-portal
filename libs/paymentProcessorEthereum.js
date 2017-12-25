var fs = require('fs');

var redis = require('redis');
var async = require('async');

var Stratum = require('stratum-pool');
var util = require('stratum-pool/lib/util.js');
var bignum = require('bignum');
var apiExt = require('./apiExt.js');
var tools = require('./addtools.js');
var extApi;

module.exports = function(logger){

    var poolConfigs = JSON.parse(process.env.pools);
    var portalConfig = JSON.parse(process.env.portalConfig);

    var enabledPools = [];

    extApi = new apiExt(poolConfigs);

    Object.keys(poolConfigs).forEach(function(coin) {
        var poolOptions = poolConfigs[coin];
        if (poolOptions.paymentProcessing &&
            poolOptions.paymentProcessing.enabled)
            enabledPools.push(coin);
    });

    async.filter(enabledPools, function(coin, callback){
        SetupForPool(logger, poolConfigs[coin], portalConfig.mysql.enabled, function(setupResults){
            callback(setupResults);
        });
    }, function(coins){
        coins.forEach(function(coin){

            var poolOptions = poolConfigs[coin];
            var processingConfig = poolOptions.paymentProcessing;
            var logSystem = 'Payments';
            var logComponent = coin;

            logger.special(logSystem, logComponent, 'Payment processing setup to run every '
                + processingConfig.paymentInterval + ' second(s) with daemon ('
                + processingConfig.daemon.user + '@' + processingConfig.daemon.host + ':' + processingConfig.daemon.port
                + ') and redis (' + poolOptions.redis.host + ':' + poolOptions.redis.port + ')');

        });
    });

    process.send({cmd : "Hello"});

};


function SetupForPool(logger, poolOptions, isSql, setupFinished){


    var coin = poolOptions.coin.name;
    var coinsymb = poolOptions.coin.symbol;
    var processingConfig = poolOptions.paymentProcessing;

    var logSystem = 'Payments';
    var logComponent = coin;

    var daemon = new Stratum.daemon.interface([processingConfig.daemon], function(severity, message){
        logger[severity](logSystem, logComponent, message);
    });
    var redisClient = redis.createClient(poolOptions.redis.port, poolOptions.redis.host);
    var models = null;
    if (isSql)
        models = require('../models');

    var magnitude;
    var minPaymentSatoshis;
    var minPaymentCoin;
    var coinPrecision;
    var filterId;

    var paymentInterval;

    var satoshisToCoins = function(satoshis){
        return parseFloat((satoshis / magnitude).toFixed(coinPrecision));
    };

    var coinsToSatoshies = function(coins){
        return coins * magnitude;
    };

    process.on('message', function( msg ){
        logger.debug(logSystem, logComponent, 'Payment processor message ' + JSON.stringify(msg));
    });

    async.parallel([
        function(callback){
            extApi.paymentCmd(coin, 'eth_accounts', [], function(result) {
                if (result.error){
                    logger.error(logSystem, logComponent, 'Error with payment processing daemon ' + JSON.stringify(result.error));
                    callback(true);
                }
                else if (!result.response || result.response.indexOf(processingConfig.daemon.user) == -1 ) {
                    logger.error(logSystem, logComponent,
                            'Daemon does not own pool address - payment processing can not be done with this daemon, '
                            + JSON.stringify(result.response));
                    callback(true);
                }
                else{
                    callback();
                }
            }, true);
        },
        function(callback){
//            daemon.cmd('eth_getBalance', [processingConfig.daemon.user,"latest"], function(result){
            extApi.getPaymentBalance(coin, function(result){
                if ( result.error ){
                    callback(true);
                    return;
                }
                try {
                    var d_str = JSON.parse(result.data).result;
                    magnitude = parseInt('10' + new Array(18).join('0'));
                    minPaymentSatoshis = parseInt(processingConfig.minimumPayment * magnitude);
                    minPaymentCoin = parseFloat(processingConfig.minimumPayment);
                    coinPrecision = magnitude.toString().length - 1;

                    var d = bignum( d_str.substr(2), 16 );
                    var ds = d.toString();
                    var d_coins = satoshisToCoins(d);
                    callback();
                }
                catch(e){
                    logger.error(logSystem, logComponent, 'Error detecting number of satoshis in a coin, cannot do payment processing. Tried parsing: ' + result.data);
                    callback(true);
                }

            });//, true, true);
        }],

        function(err, result){
        if (err){
            setupFinished(false);
            return;
        }
        paymentInterval = setInterval(function(){
            try {
               checkNewPayout();
            } catch(e){
                throw e;
            }
        }, processingConfig.paymentInterval * 1000);
        setInterval(function(){
            try {
                checkBalance();
            } catch(e){
                throw e;
            }
        }, 60 * 1000);
        let _histcounter = -1;
        setInterval(function(){
            try {
                computeBalance(_histcounter++);
            } catch(e){
                throw e;
            }
        }, 2 * 60 * 1000);
        setTimeout(checkNewPayout, 100);
        setTimeout(checkBalance, 100);
        setTimeout(computeBalance(_histcounter++), 100);

        setupFinished(true);
    });

    var checkBalance = function()
    {
        extApi.getBalance(coin, function(err, result){
            if( !err && models ) {
                models.Pbalance.findCreateFind({where: {coin: coin}}).spread((pbalance, created) => {
                    var poolbalance = parseFloat(result.data);
                    if (poolbalance>0) {
                        if (poolbalance >= pbalance.value) {
                            pbalance.value = poolbalance;
                            pbalance.basevalue = poolbalance;
                        } else {
                            pbalance.value = parseFloat(pbalance.basevalue) + poolbalance;
                        }
                        pbalance.save()
                    }
                })
            }
        });
    };

    var computeBalance = function(histcounter)
    {
        if (!models) return;

        async.waterfall([
            function(callback){
                models.Pbalance.findOne({ where: {coin: coin} }).then( pbalance => {
                    if (pbalance){
                        callback(null, pbalance.value)
                    } else {
                        callback(null, 0)
                    }
                });
            }, function (poolbalance, callback) {
                var totalshares = 0;
                var usershares = {};
                var userbalance = {};
                redisClient.hgetall( coin + ":shares:roundCurrent", function(err, result){
                    if (err) callback(err);
                    for( var r in result )
                    {
                        if (typeof usershares[tools.parseName(r)[0].toLowerCase()] === 'undefined'){
                            usershares[tools.parseName(r)[0].toLowerCase()] = parseFloat(result[r]);
                        } else {
                            usershares[tools.parseName(r)[0].toLowerCase()] += parseFloat(result[r]);
                        }
                        totalshares += parseFloat(result[r]);
                    }

                    Object.keys(usershares).forEach(function(user) {
                        userbalance[user] = {};
                        userbalance[user].balance = totalshares > 0 ? poolbalance * (usershares[user] / totalshares) : 0;
                        userbalance[user].shares = usershares[user];
                        userbalance[user].percents = totalshares > 0 ? usershares[user] / totalshares : 0;
                    });

                    callback(null, userbalance);
                });
            }
        ], function(err, balances){
            models.User.findAll().then( users => {
                let nowTime = Date.now();
                users.forEach(function(user) {
                    models.Sharebalance.findCreateFind({where: {user:user.name, coin: coin, sym: coinsymb}}).spread((sharebalance, created) => {
                        sharebalance.value = balances[user.name.toLowerCase()] ? balances[user.name.toLowerCase()].balance : 0;
                        sharebalance.shares = balances[user.name.toLowerCase()] ? balances[user.name.toLowerCase()].shares : 0;
                        sharebalance.percents = balances[user.name.toLowerCase()] ? balances[user.name.toLowerCase()].percents : 0;
                        if (histcounter % 2 === 0) {
                            models.Sharehist.create({
                                coin: sharebalance.coin,
                                shares: sharebalance.shares > sharebalance.prevshares ? sharebalance.shares - sharebalance.prevshares : sharebalance.shares,
                                time: nowTime,
                                user: user.name
                            });
                            sharebalance.prevshares = sharebalance.shares;
                        }
                        sharebalance.save()
                    })
                });
            })
        });
    };

    var checkNewPayout = function()
    {
        async.waterfall([
        function(callback){
            extApi.getBalance(coin, function(err, result){
                if( err ) {
                    callback(true);
                    return;
                }
                callback(null, result.data);
            });
        },function(balance, callback){
            extApi.getPayments(coin, function( err, result) {
                if(err || !result || !result.data) return callback(true);

                redisClient.multi([
                    ['smembers', coin + ':blocksPending'],
                    ['smembers', coin + ':blocksOrphaed'],
                    ['smembers', coin + ':blocksKicked'],
                    ['smembers', coin + ':blocksConfirmed']
                ]).exec(function(error, results){
                    if( error )
                    {
                        callback(true);
                        return;
                    }
                    var blocks = [];
                    var newblocks = [];
                    results.forEach( function(x, i){
                            x.forEach(function (cb) {
                                blocks = blocks.concat(cb.split(':')[1]);
                            });
                    });

                    result.data.forEach(function(x)
                    {
                        if( blocks.indexOf(x.txHash) == -1) newblocks.unshift(x);
                    });

                    newblocks = newblocks.sort(function(a,b){return a.date - b.date} );

                    callback(null, newblocks, balance)
                });
            });

        }, function(newblocks, balance, callback){
            var redisCommands=[];
            var ethCommands=[];
            var renamecommand;
            var lastblock=0;

                    newblocks.forEach( function(x){
                        ethCommands.push( function(callback) {
                            extApi.paymentCmd(coin, 'eth_getTransactionByHash', [x.txHash], function (result) {
                                if (result.error || !result.response) {
                                    callback(true);
                                    return;
                                }
                                redisCommands.push(['sadd', coin + ':blocksPending', [result.response.blockHash, result.response.hash, result.response.blockNumber].join(':')]);
                                if( result.response.blockNumber > lastblock )
                                {
                                    lastblock = result.response.blockNumber;
                                    renamecommand = ['rename', coin + ':shares:roundCurrent', coin + ':shares:round' + result.response.blockNumber];
                                    if (models){
                                        models.Pbalance.findCreateFind({where: {coin: coin}}).spread((pbalance, created) => {
                                            pbalance.basevalue = balance;
                                            pbalance.value = balance;
                                            pbalance.save()
                                        })
                                    }
                                }

                                callback();
                            }, true, true);
                        });
                    });

                    if( ethCommands.length > 0 ) {
                        async.parallel(ethCommands, function (err) {
                            if (err) {
                                callback(true);
                                return;
                            }
                            redisCommands.push(renamecommand);
                            redisClient.multi(redisCommands).exec(function (err, results) {
                                    callback();
                                }
                            );
                        });
                    }else{
                        callback();
                    }



        }],
            function(err){
                if(!err) {
                    processPayments();
                }
            }
        );
    };


    /* Deal with numbers in smallest possible units (satoshis) as much as possible. This greatly helps with accuracy
       when rounding and whatnot. When we are storing numbers for only humans to see, store in whole coin units. */

    var processPayments = function(){

        var startPaymentProcess = Date.now();

        var timeSpentRPC = 0;
        var timeSpentRedis = 0;

        var startTimeRedis;
        var startTimeRPC;

        var startRedisTimer = function(){ startTimeRedis = Date.now() };
        var endRedisTimer = function(){ timeSpentRedis += Date.now() - startTimeRedis };

        var startRPCTimer = function(){ startTimeRPC = Date.now(); };
        var endRPCTimer = function(){ timeSpentRPC += Date.now() - startTimeRedis };
        var userlist = [];

        async.waterfall([

            function(callback){

                if (models){
                    models.User.findAll()
                    .then( users => {
                        userlist = (users || []);
                    })
                    .then( () => {
                        models.Ubalance.findAll({where: {coin: coin}}).then(balances => {
                            var workers = {};
                            balances.forEach(function (balance) {
                                workers[balance.name] = {balance: coinsToSatoshies(parseFloat(balance.value))};
                            });
                            callback(null, workers);
                        })
                    })
                } else {
                    startRedisTimer();
                    redisClient.multi([
                        ['hgetall', coin + ':balances']
                    ]).exec(function (error, results) {
                        endRedisTimer();
                        if (error) {
                            logger.error(logSystem, logComponent, 'Could not get blocks from redis ' + JSON.stringify(error));
                            callback(true);
                            return;
                        }
                        var workers = {};
                        for (var w in results[0]) {
                            workers[w] = {balance: coinsToSatoshies(parseFloat(results[0][w]))};
                        }

                        callback(null, workers);
                    });
                }
            },

            /* Call redis to get an array of rounds - which are coinbase transactions and block heights from submitted
               blocks. */
            function(workers, callback){

                startRedisTimer();
                redisClient.multi([
                    ['smembers', coin + ':blocksPending']
                ]).exec(function(error, results){
                    endRedisTimer();

                    if (error){
                        logger.error(logSystem, logComponent, 'Could not get blocks from redis ' + JSON.stringify(error));
                        callback(true);
                        return;
                    }

                    var rounds = results[0].map(function(r){
                        var details = r.split(':');
                        return {
                            blockHash: details[0],
                            txHash: details[1],
                            height: details[2],
                            serialized: r
                        };
                    });

                    rounds = rounds.sort(function(a, b){return parseInt(a.height.substr(2), 16) - parseInt(b.height.substr(2), 16) ;});

                    callback(null, workers, rounds);
                });
            },

            /* Does a batch rpc call to daemon with all the transaction hashes to see if they are confirmed yet.
               It also adds the block reward amount to the round object - which the daemon gives also gives us. */
            function(workers, rounds, callback)
            {
                extApi.getPaymentAccounts(coin, function(x) {
                    callback( null, x.response[0], workers, rounds);
                });
            },
            function(account, workers, rounds, callback){

                var batchRPCcommand = rounds.map(function(r){
                    return ['eth_getTransactionByHash', [r.txHash]];
                });

                startRPCTimer();
                extApi.paymentBatchCmd(coin, batchRPCcommand, function(error, txDetails){
                    endRPCTimer();

                    if (error || !txDetails){
                        logger.error(logSystem, logComponent, 'Check finished - daemon rpc error with batch gettransactions '
                            + JSON.stringify(error));
                        callback(true);
                        return;
                    }

                    var addressAccount = account;

                    txDetails.forEach(function(tx, i){
                        var round = rounds[i];

                        if (tx.error || !tx.response){
                            logger.error(logSystem, logComponent, 'Odd error with gettransaction ' + round.txHash + ' '
                                + JSON.stringify(tx));
                            return;
                        }

                        var generationTx = tx.response;
                        if (!generationTx){
                            logger.error(logSystem, logComponent, 'Missing output details to pool address for transaction '
                                + round.txHash);
                            return;
                        }

                        round.category = "generate";
                        var curreward = generationTx.amount || generationTx.value;
                        round.reward = satoshisToCoins(parseInt(curreward.substr(2), 16));
                    });

                    var canDeleteShares = function(r){
                        for (var i = 0; i < rounds.length; i++){
                            var compareR = rounds[i];
                            if ((compareR.height === r.height)
                                && (compareR.category !== 'kicked')
                                && (compareR.category !== 'orphan')
                                && (compareR.serialized !== r.serialized)){
                                return false;
                            }
                        }
                        return true;
                    };


                    //Filter out all rounds that are immature (not confirmed or orphaned yet)
                    rounds = rounds.filter(function(r){
                        switch (r.category) {
                            case 'orphan':
                            case 'kicked':
                                r.canDeleteShares = canDeleteShares(r);
                            case 'generate':
                                return true;
                            default:
                                return false;
                        }
                    });


                    callback(null, workers, rounds, addressAccount);

                });
            },


            /* Does a batch redis call to get shares contributed to each round. Then calculates the reward
               amount owned to each miner for each round. */
            function(workers, rounds, addressAccount, callback){


                var shareLookups = rounds.map(function(r){
                    return ['hgetall', coin + ':shares:round' + r.height]
                });

                startRedisTimer();
                redisClient.multi(shareLookups).exec(function(error, allWorkerShares){
                    endRedisTimer();

                    if (error){
                        callback('Check finished - redis error with multi get rounds share');
                        return;
                    }

                    var pendingReward = 0;

                    for( var i =0 ; i <  Object.keys(rounds).length; i++ ){

                        var workerShares = allWorkerShares[i];
                        var round = rounds[i];

                        if (!workerShares){
                            logger.error(logSystem, logComponent, 'No worker shares for round: '
                                + round.height + ' blockHash: ' + round.blockHash);
                            pendingReward += round.reward;
                            continue;
                        }

                        round.reward += pendingReward;
                        pendingReward = 0;

                        switch (round.category){
                            case 'kicked':
                            case 'orphan':
                                round.workerShares = workerShares;
                                break;
                            case 'generate':
                                /* We found a confirmed block! Now get the reward for it and calculate how much
                                   we owe each miner based on the shares they submitted during that block round. */
                                var reward = parseInt(round.reward * magnitude);

                                var totalShares = Object.keys(workerShares).reduce(function(p, c){
                                    return p + parseFloat(workerShares[c])
                                }, 0);

                                for (var workerAddress in workerShares){
                                    var percent = parseFloat(workerShares[workerAddress]) / totalShares;
                                    var workerRewardTotal = Math.floor(reward * percent);
                                    var worker = workers[getProperAddress(workerAddress,userlist)] = (workers[getProperAddress(workerAddress,userlist)] || {});
                                    worker.reward = (worker.reward || 0) + workerRewardTotal;
                                }
                                break;
                        }
                    }

                    callback(null, workers, rounds, addressAccount);
                });
            },

            function(workers, rounds, addressAccount, callback)
            {
                if (models){
                    models.Payouts.findAll({where: {status:0, coin: coin}}).then( payouts => {
                        callback(null, workers, rounds, addressAccount, payouts);
                    })
                } else {
                    callback(null, workers, rounds, addressAccount, []);
                }
            },
            /* Calculate if any payments are ready to be sent and trigger them sending
             Get balance different for each address and pass it along as object of latest balances such as
             {worker1: balance1, worker2, balance2}
             when deciding the sent balance, it the difference should be -1*amount they had in db,
             if not sending the balance, the differnce should be +(the amount they earned this round)
             */
            function(workers, rounds, addressAccount, payouts, callback) {
                var redisCommands=[];
                var clients=new Object();

                var trySend = function (withholdPercent) {
                    var addressAmounts = {};
                    var totalSent = 0;
                    for (var w in workers) {
                        var worker = workers[w];
                        var address = worker.address = (worker.address || getProperAddress(w,userlist));
                        if( typeof clients[address] === "undefined" ) clients[address] = {address: address, sent: 0, balanceChange : 0, reward : 0, balance : 0};
                        var client = clients[address];

                        worker.balance = worker.balance || 0;
                        worker.reward = worker.reward || 0;

                        var toSendClient = (client.sent + satoshisToCoins(worker.balance) + satoshisToCoins(worker.reward)) * (1 - withholdPercent);
                        var toSend = (satoshisToCoins(worker.balance) + satoshisToCoins(worker.reward) ) * (1 - withholdPercent);
                        if (toSendClient >= satoshisToCoins(minPaymentSatoshis) || (toSend > 0 && payouts.find(el => el.name.toLowerCase() === address.toLowerCase()))) {
                            totalSent += toSend;
                            client.sent = addressAmounts[address] = toSendClient;
                            client.balanceChange += satoshisToCoins(worker.balance) * -1;
                            worker.sent = addressAmounts[address] = toSend;
                            worker.balanceChange = satoshisToCoins(worker.balance) * -1;
                            redisCommands.push(['hincrbyfloat', coin + ':payments:pending', worker.address, worker.sent ] );
                        }
                        else {
                            client.balanceChange += Math.max(toSend - satoshisToCoins(worker.balance), 0);
                            client.sent += 0;
                            worker.balanceChange = Math.max(toSend - satoshisToCoins(worker.balance), 0);
                            worker.sent = 0;
                        }
                    }

                    if (Object.keys(addressAmounts).length === 0){
                        callback(null, clients, rounds);
                        return;
                    }

                    redisClient.multi(redisCommands).exec(function(error, results){
                        if (!error && models) {
                            let nowTime = Date.now();
                            redisCommands.forEach(function(command) {
                                 models.Payouts.findCreateFind({where: {name: command[2], coin: command[1].split(':')[0], status:0, sendedAt:0}}).spread((payout, created) => {
                                     models.Accrualshist.create({
                                         coin: payout.coin,
                                         value: parseFloat(command[3]),
                                         time: nowTime,
                                         user: command[2]
                                     });
                                     return payout.increment('value', {by: parseFloat(command[3])});
                                 })
                            })
                        }
                    });
                    callback(null, clients, rounds);
                };
                trySend(0);

            },
            function(workers, rounds, callback){

                var totalPaid = 0;

                var balanceUpdateCommands = [];
                var workerPayoutsCommand = [];

                for (var w in workers) {
                    var worker = workers[w];
                    if (worker.balanceChange !== 0){
                        balanceUpdateCommands.push([
                            'hincrbyfloat',
                            coin + ':balances',
                            worker.address,
                            worker.balanceChange
                        ]);
                    }
                    if (worker.sent !== 0){
                        workerPayoutsCommand.push(['hincrbyfloat', coin + ':payouts', worker.address, worker.sent]);
                        totalPaid += worker.sent;
                    }
                }



                var movePendingCommands = [];
                var roundsToDelete = [];
                var orphanMergeCommands = [];
                var renameSharesCommands = [];

                var moveSharesToCurrent = function(r){
                    var workerShares = r.workerShares;
                    Object.keys(workerShares).forEach(function(worker){
                        orphanMergeCommands.push(['hincrby', coin + ':shares:roundCurrent',
                            worker, workerShares[worker]]);
                    });
                };

                rounds.forEach(function(r){

                    switch(r.category){
                        case 'kicked':
                            movePendingCommands.push(['smove', coin + ':blocksPending', coin + ':blocksKicked', r.serialized]);
                        case 'orphan':
                            movePendingCommands.push(['smove', coin + ':blocksPending', coin + ':blocksOrphaned', r.serialized]);
                            if (r.canDeleteShares){
                                moveSharesToCurrent(r);
                                roundsToDelete.push(coin + ':shares:round' + r.height);
                            }
                            return;
                        case 'generate':
                            movePendingCommands.push(['smove', coin + ':blocksPending', coin + ':blocksConfirmed', r.serialized]);
                            renameSharesCommands.push(['rename', coin + ':shares:round' + r.height, coin + ':sharesDone:round' + r.height]);
                            //roundsToDelete.push(coin + ':shares:round' + r.height);
                            return;
                    }

                });

                var finalRedisCommands = [];

                if (movePendingCommands.length > 0)
                    finalRedisCommands = finalRedisCommands.concat(movePendingCommands);

                if (orphanMergeCommands.length > 0)
                    finalRedisCommands = finalRedisCommands.concat(orphanMergeCommands);

                if (balanceUpdateCommands.length > 0)
                    finalRedisCommands = finalRedisCommands.concat(balanceUpdateCommands);

                if (workerPayoutsCommand.length > 0)
                    finalRedisCommands = finalRedisCommands.concat(workerPayoutsCommand);

                if (renameSharesCommands.length > 0)
                    finalRedisCommands = finalRedisCommands.concat(renameSharesCommands);

                if (roundsToDelete.length > 0)
                    finalRedisCommands.push(['del'].concat(roundsToDelete));

                if (totalPaid !== 0)
                    finalRedisCommands.push(['hincrbyfloat', coin + ':stats', 'totalPaid', totalPaid]);

                if (finalRedisCommands.length === 0){
                    callback();
                    return;
                }

                startRedisTimer();
                redisClient.multi(finalRedisCommands).exec(function(error, results){
                    endRedisTimer();
                    if (error){
                        clearInterval(paymentInterval);
                        logger.error(logSystem, logComponent,
                                'Payments sent but could not update redis. ' + JSON.stringify(error)
                                + ' Disabling payment processing to prevent possible double-payouts. The redis commands in '
                                + coin + '_finalRedisCommands.txt must be ran manually');
                        fs.writeFile(coin + '_finalRedisCommands.txt', JSON.stringify(finalRedisCommands), function(err){
                            logger.error('Could not write finalRedisCommands.txt, you are fucked.');
                        });
                    } else if (models){
                        let nowTime = Date.now();
                        balanceUpdateCommands.forEach(function(command) {
                            models.Ubalance.findCreateFind({where: {name: command[2], coin: command[1].split(':')[0]}}).spread((balance, created) => {
                                models.Accrualshist.create({
                                    coin: balance.coin,
                                    value: parseFloat(command[3]),
                                    time: nowTime,
                                    user: command[2]
                                });
                                return balance.increment('value', {by: parseFloat(command[3])});
                            })
                        });
                        models.Sharehist.destroy({
                            where: {},
                            truncate: true
                        })
                    }
                    callback();
                });
            }

        ], function(){
            computeBalance();
            var paymentProcessTime = Date.now() - startPaymentProcess;
            logger.debug(logSystem, logComponent, 'Finished interval - time spent: '
                + paymentProcessTime + 'ms total, ' + timeSpentRedis + 'ms redis, '
                + timeSpentRPC + 'ms daemon RPC');

        });
    };


    var getProperAddress = function(address,userlist){
        var Address = address;
        if( address.indexOf("/") !== -1 ) Address = address.substr(0, address.indexOf("/"));
        if( Address.length === 40 )
        {
            try {
                new Buffer(workerName, 'hex');
                Address = "0x" + Address;
            }catch (e){

            }
        }
        if(models){
            var user = userlist.find(el => el.name.toLowerCase() === Address.toLowerCase());
            return (user ? user.name : Address)
        } else {
            return Address;
        }
    };


}
