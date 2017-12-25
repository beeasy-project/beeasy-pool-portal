var redis = require('redis');
var async = require('async');
var crypto = require('crypto');

module.exports = function(logger, portalConfig, poolConfigs){

    var logSystem = 'Payouts';
    var redisStats;

    setupStatsRedis();

    function setupStatsRedis(){
        redisStats = redis.createClient(portalConfig.redis.port, portalConfig.redis.host);
        redisStats.on('error', function(err){
            logger.error(logSystem, 'Historics', 'Redis for stats had an error ' + JSON.stringify(err));
        });
    }

    this.getPendingPayouts = function(coin, username, isenougth, callback){

        redisStats.hgetall(coin + ":payments:pending",  function( err, result ){
            if (err) {
                logger.error(logSystem, 'Payout', 'Error when trying to grab pending stats ' + JSON.stringify(err));
                return;
            }

            var res = new Object();

            var poolConfig = poolConfigs[coin];
            async.each(Object.keys(result || []), function(a, callback){
                res[a]={user: a, address : "undefined", total_amount: result[a], amount : result[a], amount_affiliate : 0, payoffs:[] };

                getPayOutWallet( coin, a, function(address){
                    res[a]["address"] = address;
                    if( Object.keys(poolConfig.rewardRecipients).indexOf(a) == -1 ) {
                        Object.keys(poolConfig.rewardRecipients).forEach(function (r) {
                            poolConfig.rewardRecipients[r].from.forEach(function (x) {
                                if (x == "*" || x == a) {
                                    var amount_affiliate = res[a]['total_amount'] * poolConfig.rewardRecipients[r].percent;
                                    res[a]['amount'] -= amount_affiliate;
                                    res[a]['amount_affiliate'] += amount_affiliate;
                                    res[a].payoffs.push({
                                        to: r,
                                        amount: amount_affiliate,
                                        subject: poolConfig.rewardRecipients[r].subject
                                    });
                                }
                            });
                        });
                    }
                    callback();
                });
            },function(err) {
                callback({error: null, result: res});
            });
        });
    };

    this.getPayments = function(username, coin, callback){
        return callback({error:null,dataArray:[]});
    };

    this.sendPayment= function(coin, transaction, callback ){

        redisStats.hget(coin + ":payments:pending", transaction.user, function( err, reply ){
            if (err) {
                logger.error(logSystem, 'Payout', 'Error when trying to grab pending stats ' + JSON.stringify(err));
                callback({error:"Amount exceeded", result:null});
                return;
            }
            var curval = parseFloat(reply);
            var curam = parseFloat(transaction.total_amount);
            if( curam == curval )
            {
                async.waterfall([
                    function(callback){
                        redisStats.hdel(coin + ":payments:pending", transaction.user, function( err, reply ) {
                        if (err || reply == 0) {
                            logger.error(logSystem, 'Payout', 'Redis deletion problem ' + transaction.user + ' ' + amount.toString() + JSON.stringify(err));
                            callback(true, {error: "Redis deletion problem", result: null});
                            return;
                            }
                            callback();
                        })
                    },
                    function(callback) {
                        redisStats.hset(coin + ":payments:transit", transaction.user, transaction.total_amount, function (err, reply) {
                            if (err) {
                                logger.error(logSystem, 'Payout', 'Redis transit problem ' + transaction.user + ' ' + transaction.total_amount.toString() + JSON.stringify(err));
                                callback(true, {error: "Redis transit problem", result: null});
                                return;
                            }
                            callback();
                        })
                    },
                    function(callback)
                    {
                        transaction.payoffs.forEach(function(r){
                            redisStats.hincrbyfloat(coin + ":balances", r.to, r.amount, function(err, result){});
                        });


                        callback( );


                    }, function( callback ) {
                            process.send({cmd:"payout", transaction : transaction });
                            callback();
                    }] , function( err ) {
                            if(! err ) {
                                callback({error: null, result: "Transaction sent"});
                            }
                    });
            }else{
                callback({error:"Incorrect amount", result:null});
            }
        });
//        process.send({cmd:"payout", toaddress: "0xf3D1888c0b1F4eb68075701B1d33F6b799A34901", amount : 0.0001});
//        callback({error: null, result: "Transaction sent"});
    };

    function getPayOutWallet(coin, username, callback  )
    {
        if (username.length === 40 ){
            try {
                new Buffer(username, 'hex');
                callback( "0x" + username );
            }
            catch (e) {
                callback( "undefined" );
            }
        } else if(username.length ===  42 && username.substr(0, 2) == "0x" )
        {
            try {
                new Buffer(username.substr(2), 'hex');
                callback(username);
            }
            catch (e) {
                callback("undefined");
            }
        }else {
            redisStats.hget("users", username, function(err, result) {
                if( err || result == null) {
                    callback("undefined");
                    return;
                }
                var res = JSON.parse(result);
                if( typeof res["wallets"] == "undefined" || typeof res["wallets"][coin] == "undefined")
                {
                    callback("undefined");
                    return;
                }

                var wallet = res["wallets"][coin];
                if (wallet.length === 40 ){
                    try {
                        new Buffer(wallet, 'hex');
                        return callback( "0x" + wallet );
                    }
                    catch (e) {
                        return callback( "undefined" );
                    }
                } else if(wallet.length ===  42 && wallet.substr(0, 2) == "0x" )
                {
                    try {
                        new Buffer(wallet.substr(2), 'hex');
                        return callback(wallet);
                    }
                    catch (e) {
                        return callback("undefined");
                    }
                }

                return callback("undefined");
            });
        }
    }
};
