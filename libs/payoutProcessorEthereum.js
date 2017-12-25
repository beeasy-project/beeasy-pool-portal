var fs = require('fs');

var redis = require('redis');
var async = require('async');

var Stratum = require('stratum-pool');

module.exports = function(logger){

    var poolConfigs = JSON.parse(process.env.pools);
    var portalConfig = JSON.parse(process.env.portalConfig);

    var enabledPools = [];

    Object.keys(poolConfigs).forEach(function(coin) {
        var poolOptions = poolConfigs[coin];
        if (poolOptions.payoutProcessing &&
            poolOptions.payoutProcessing.enabled)
            enabledPools.push(coin);
    });

    async.filter(enabledPools, function(coin, callback){
        SetupForPool(logger, poolConfigs[coin], portalConfig.mysql.enabled, function(setupResults){
            callback(setupResults);
        });
    }, function(coins){
        coins.forEach(function(coin){

            var poolOptions = poolConfigs[coin];
            var processingConfig = poolOptions.payoutProcessing;
            var logSystem = 'Payouts';
            var logComponent = coin;

            logger.debug(logSystem, logComponent, 'Payment processing setup to run every '
                + processingConfig.paymentInterval + ' second(s) with daemon ('
                + processingConfig.daemon.user + '@' + processingConfig.daemon.host + ':' + processingConfig.daemon.port
                + ') and redis (' + poolOptions.redis.host + ':' + poolOptions.redis.port + ')');

        });
    });

    process.send({cmd : "Payout Hello"});
};

function SetupForPool(logger, poolOptions, isSql, setupFinished){

    var coin = poolOptions.coin.name;
    var processingConfig = poolOptions.payoutProcessing;

    var logSystem = 'Payments';
    var logComponent = coin;

    var daemon = new Stratum.daemon.interface([processingConfig.daemon], function(severity, message){
        logger[severity](logSystem, logComponent, message);
    });

    var redisClient = redis.createClient(poolOptions.redis.port, poolOptions.redis.host);

    var models = null;
    if (isSql)
        models = require('../models');

    var magnitude = parseInt('10' + new Array(18).join('0'));

    var coinsToSatoshies = function(coins){
        return coins * magnitude;
    };

    var processMessageRedis = function (transaction) {
        redisClient.hget(coin + ":payments:transit", transaction.user, function (err, reply) {
            if (err || !reply) {
                logger.error(logSystem, logComponent, "No transaction is transit zone: " + JSON.stringify(transaction));
                return;
            }
            var curval = parseFloat(reply);
            var curam = parseFloat(transaction.total_amount);
            if (curam == curval) {
                var command = {
                    "from": processingConfig.daemon.user.toLowerCase().substr(0),
                    "to": transaction.address.substr(0),
                    "value": "0x" + coinsToSatoshies(transaction.amount).toString(16)
                };
                sendTransaction(command, function (err, result) {
                    if (err) {
                        logger.error(logSystem, logComponent, JSON.stringify(err));
                        return;
                    }
                    var rediscommands = [
                        ['hset', coin + ':payments:done', result.response, JSON.stringify({
                            tx: result.response,
                            user: transaction.user,
                            to: transaction.address,
                            amount: transaction.amount,
                            time: Date.now() / 1000
                        })],
                        ['hset', coin + ':payouts:done:' + transaction.user, result.response, JSON.stringify({
                            tx: result.response,
                            to: transaction.address,
                            amount: transaction.amount,
                            time: Date.now() / 1000,
                            transaction : transaction
                        })],
                        ['hdel', coin + ':payments:transit', transaction.user]
                    ];

                    redisClient.multi(rediscommands).exec(function (error, results) {
                        if (error) {
                            logger.error(logSystem, logComponent, JSON.stringify(error));
                            return;
                        }
                        logger.debug(logSystem,logComponent, "Payment for " + transaction.user + " to wallet " + transaction.address + " of " +
                            transaction.amount + " has been done succesfully. Tx : " + result.response);
                    });
                });
            }else{
                logger.error(logSystem, logComponent, "Incorrect transaction amount " + curam.toFixed(10) + " instead of " + curval.toFixed(10));
            }
        });
    };

    var processMessageSql = function (transaction) {
        models.Payouts.findOne({where: {name:transaction.user, status:1, coin: coin}}).then( payout => {
            if (!payout){
                logger.error(logSystem, logComponent, "No transaction is transit zone: " + JSON.stringify(transaction));
                return;
            }
            var curval = parseFloat(payout.value);
            var curam = parseFloat(transaction.total_amount);
            if (curam === curval) {
                var command = {
                    "from": processingConfig.daemon.user.toLowerCase().substr(0),
                    "to": transaction.address.substr(0),
                    "value": "0x" + coinsToSatoshies(transaction.amount).toString(16)
                };
                models.sequelize.transaction({
                    isolationLevel: models.Sequelize.Transaction.ISOLATION_LEVELS.SERIALIZABLE
                }, function (t) {
                    return payout.reload({transaction: t, lock: t.LOCK.UPDATE}).then( () => {
                        if(payout.status !== 1) {
                            throw new Error();
                        }
                        return sendTransactionPromise(command).then( result => {
                            return Promise.all(
                                transaction.payoffs.map(function(r){
                                    models.Ubalance.findOrCreate({where: {name: r.to, coin: coin}, transaction: t }).spread((balance, created) => {
                                        return balance.increment('value', {by: parseFloat(r.amount), transaction: t});
                                    })
                                })
                            ).then(function (user) {
                                payout.tx = result.response;
                                payout.sendedAt = Date.now();
                                payout.status = 2;
                                return payout.save({transaction: t}).then(function (payout) {
                                    return models.Payments.create({
                                        coin: coin,
                                        user: transaction.user,
                                        tx: result.response,
                                        to: transaction.address,
                                        amount: transaction.amount,
                                        time: Date.now(),
                                        transaction: transaction
                                    }, {
                                        include: [{
                                            model: models.Transactions,
                                            as: 'transaction'
                                        }],
                                        transaction: t
                                    });
                                });
                            })
                        });
                    })
                });
            } else {
                logger.error(logSystem, logComponent, "Incorrect transaction amount " + curam.toFixed(10) + " instead of " + curval.toFixed(10));
            }
        })
    };

    function sendTransactionPromise(command){
        return new Promise(function(resolve,reject){
            sendTransaction(command,function(err,data){
                if(err !== null) return reject(err);
                resolve(data);
            });
        });
    }

    let sendTransaction = function (command, callback) {
        daemon.isOnline(function (bOnline) {
            if (bOnline){
                daemon.cmd('eth_sendTransaction', [command], function (result) {
                    logger.debug(logSystem, logComponent, "eth_sendTransaction : " + JSON.stringify(result));
                    if (result.error) {
                        logger.error(logSystem, logComponent, "eth_sendTransaction error : " + JSON.stringify(result));
                        return callback(result.error,result);
                    }
                    callback(null,result);
                }, true, true);
            } else {
                logger.error(logSystem, logComponent, "Demon is not responding. Try again later.");
                return callback("Demon is not responding. Try again later.",result);
            }
        });
    };

    process.on('message', function( msg ){
        logger.debug(logSystem, logComponent, 'Payout processor message ' + JSON.stringify(msg));
        let transaction = msg.transaction;
        if(msg.cmd === "payout") {
            if(models)
                processMessageSql(transaction);
            else
                processMessageRedis(transaction);
        }

    });

    setupFinished(true)
}