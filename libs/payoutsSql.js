var async = require('async');
var crypto = require('crypto');
var models  = require('../models');

module.exports = function(logger, portalConfig, poolConfigs){
    var logSystem = 'Payouts';

    this.getPendingPayouts= function(coin, callback){
        models.Payouts.findAll({where: {status:0, coin: coin}}).then( payouts => {
            var res = {};
            var poolConfig = poolConfigs[coin];
            async.each(payouts, function(payout, callback){
                res[payout.name]={user: payout.name, address : "undefined", total_amount: payout.value, amount : payout.value, amount_affiliate : 0, payoffs:[] };

                getPayOutWallet( coin, payout.name, function(address){
                    res[payout.name]["address"] = address;
                    models.User.findOne({ where: {name: payout.name}, include: [ 'Payoffs' ]}).then( user => {
                        var specialPercents = 0;
                        if (user){
                            user.Payoffs.forEach(function(payoff) {
                                var amount_affiliate = res[payout.name]['total_amount'] * payoff.percent;
                                res[payout.name]['amount'] -= amount_affiliate;
                                res[payout.name]['amount_affiliate'] += amount_affiliate;
                                res[payout.name].payoffs.push({
                                    to: payoff.recipient,
                                    amount: amount_affiliate,
                                    subject: payoff.subject
                                });
                                if (payoff.recipient!=='poolowner' && payoff.recipient!=='datacenter') {
                                    specialPercents += payoff.percent
                                }
                            });
                        }
                        if( Object.keys(poolConfig.rewardRecipients).indexOf(payout.name) === -1 ) {
                            Object.keys(poolConfig.rewardRecipients).forEach(function (r) {
                                if( !res[payout.name].payoffs.find(el => el.to === r) ) {
                                    poolConfig.rewardRecipients[r].from.forEach(function (x) {
                                        if (x == "*" || x == payout.name) {
                                            var computedPercent = poolConfig.rewardRecipients[r].percent;
                                            if (r === 'poolowner'){
                                                computedPercent -= specialPercents
                                            }
                                            if (computedPercent > 0) {
                                                var amount_affiliate = res[payout.name]['total_amount'] * computedPercent;
                                                res[payout.name]['amount'] -= amount_affiliate;
                                                res[payout.name]['amount_affiliate'] += amount_affiliate;
                                                res[payout.name].payoffs.push({
                                                    to: r,
                                                    amount: amount_affiliate,
                                                    subject: poolConfig.rewardRecipients[r].subject + ' ' + Math.floor(computedPercent * 100 * 100)/100 +'%'
                                                });
                                            }
                                        }
                                    });
                                }
                            });
                        }
                        callback();
                    });
                });
            },function(err) {
                callback({error: null, result: res});
            });
        })
    };

    this.sendPayment= function(coin, transaction, callback ){
        models.Payouts.findOne({where: {name:transaction.user, status:0, coin: coin}}).then( payout => {
            if( parseFloat(transaction.total_amount) === parseFloat(payout.value) )
            {
                payout.status = 1;
                transaction.payoffs.forEach(function(r){
                    models.Ubalance.findOrCreate({where: {name: r.to, coin: coin}}).spread((balance, created) => {
                        balance.value = parseFloat(balance.value || 0) + parseFloat(r.amount);
                        balance.save();
                    })
                });
                payout.save().then(() => {
                    process.send({cmd:"payout", transaction : transaction });
                })
                callback({error: null, result: "Transaction sent"});
            } else {
                callback({error:"Incorrect amount", result:null});
            }
        })
    };

    function getPayOutWallet( coin, username, callback )
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
            models.User.findOne({ where: {name: username}, include: [ 'Wallets' ]}).then( user => {
                if (!user){
                    callback("undefined");
                    return;
                }
                var wallet = user.Wallets.find(el => el.name === coin);
                if (!wallet){
                    callback("undefined");
                    return;
                }
                if (wallet.value.length === 40 ){
                    try {
                        new Buffer(wallet.value, 'hex');
                        return callback( "0x" + wallet.value );
                    }
                    catch (e) {
                        return callback( "undefined" );
                    }
                } else if(wallet.value.length ===  42 && wallet.value.substr(0, 2) == "0x" )
                {
                    try {
                        new Buffer(wallet.value.substr(2), 'hex');
                        return callback(wallet.value);
                    }
                    catch (e) {
                        return callback("undefined");
                    }
                }

                return callback("undefined");
            })
        }
    }
};
