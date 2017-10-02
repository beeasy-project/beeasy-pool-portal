var redis = require('redis');
var async = require('async');

var stats = require('./stats.js');
var payouts = require('./payouts.js');

var crypto = require('crypto');
const userService = require('./userService.js');
const admService = require('./admService.js');
const tools = require('./addtools.js');
const apisys = require('./apiSys.js');

var mail = require('./mailSender.js');

module.exports = function(logger, portalConfig, poolConfigs){


    var _this = this;

    var portalStats = this.stats = new stats(logger, portalConfig, poolConfigs);
    var portalPayouts = this.payouts = new payouts(logger, portalConfig, poolConfigs);
    var mailSender = this.mailSender = new mail(logger, portalConfig);

    this.liveStatConnections = {};

    this.liveConnections={};

    const uService = new userService();
    const aService = new admService();
    const sysApi = new apisys();

    this.handleApiRequest = function(req, res, next){

        switch(req.params.method){
            case 'stats':
                res.writeHead(200, {
                    'Access-Control-Allow-Origin': '*'});
                res.end(portalStats.statsString);
                return;
            case 'pool_stats':
                res.writeHead(200, {
                    'Access-Control-Allow-Origin': '*'});
                res.end(JSON.stringify(portalStats.statPoolHistory));
                return;
            case 'coin_setup':
                res.writeHead(200, {
                    'Access-Control-Allow-Origin': '*'});
                res.end(JSON.stringify(portalStats.coinSetup));
                return;
            case 'live_stats':
                res.writeHead(200, {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                });
                res.write('\n');
                var uid = Math.random().toString();
                _this.liveStatConnections[uid] = res;
                req.on("close", function() {
                    delete _this.liveStatConnections[uid];
                });

                return;
            case 'feedback':
                var name = req.body.name || '';
                var email = req.body.email || '';
                var subject = req.body.subject || '';
                var info = req.body.info || '';
                res.writeHead(200, {
                    'Access-Control-Allow-Origin': '*'});
                mailSender.sendMail({name:name,email:email,subject:subject,info:info});
                res.end(JSON.stringify('OK'));
                return;
            default:
                next();
        }
    };
    this.handleAdminApiRequest = function(req, res, next){
        switch(req.params.method){
            case 'login': {
                var login = req.body.login;
                var password = req.body.password;
                var remember = req.body.remember;
                aService.loginUser(login, password, remember, res, this.stats, function (response) {
                    res.end(JSON.stringify(response));
                });
                return;
            }
            case 'checkUser': {
                aService.getCurrentUser(req, function (err, response) {
                    res.end(JSON.stringify({result: err ? false : true, error: err}));
                });
                return;
            }
            case 'logout': {
                aService.logoutUser(req, res, function (err) {
                    res.end(JSON.stringify({result: err ? false : true, error: err}));
                });
                return;
            }
            case 'pools': {
                aService.getCurrentUser(req, function (err, response) {
                    if (!err) res.end(JSON.stringify({result: Object.keys(poolConfigs)}));
                    else res.send(403, JSON.stringify({error: 'Forbidden'}));
                });
                return;
            }
            case 'live': {
                aService.getCurrentUser(req, function (err, response) {
                    if (err) res.send(403, JSON.stringify({error: 'Forbidden'}));
                    else {
                        portalStats.getLiveStats(function (err, results) {
                            res.end( JSON.stringify({result : results }));
                        });
                    }
                });
                return;
            }
            case 'historystats': {
                aService.getCurrentUser(req, function (err, response) {
                    if (err) res.send(403, JSON.stringify({error: 'Forbidden'}));
                    else {
                        _this.stats.getUserHistoryStats('', function (response) {
                            res.end(JSON.stringify(response));
                        });
                    }
                });
                return;
            }
            case 'liveconnect': {
                var connectionhash = req.body.connectionhash;
                aService.getCurrentUser(req, function (err, response) {
                    if (err) res.send(403, JSON.stringify({error: 'Forbidden'}));
                    else {
                        _this.stats.getConnectionLiveStats(connectionhash, function (response) {
                            res.end(JSON.stringify(response));
                        });
                    }
                });
                return;
            }
            case 'user': {
                var username = req.body.username;
                aService.getCurrentUser(req, function (err, response) {
                    if (err) res.send(403, JSON.stringify({error: 'Forbidden'}));
                    else {
                        portalStats.getUsers(username, function (err, results) {
                            res.end(JSON.stringify(results));
                        });
                    }
                });
                return;
            }
            case 'payoff': {
                var username = req.body.user;
                var recipient = req.body.recipient;
                var percent = req.body.percent;
                var subject = req.body.subject;
                aService.getCurrentUser(req, function (err, response) {
                    if (err) res.send(403, JSON.stringify({error: 'Forbidden'}));
                    else {
                        portalStats.addPayoff(username, recipient, percent, subject, function (err, results) {
                            res.end(JSON.stringify(results));
                        });
                    }
                });
                return;
            }
            case 'payoffdelete': {
                var username = req.body.user;
                var recipient = req.body.recipient;
                aService.getCurrentUser(req, function (err, response) {
                    if (err) res.send(403, JSON.stringify({error: 'Forbidden'}));
                    else {
                        portalStats.deletePayoff(username, recipient, function (err, results) {
                            res.end(JSON.stringify(results));
                        });
                    }
                });
                return;
            }
            case 'command': {
                var command = req.body.command;
                var names = tools.parseName(req.body.farm);
                if (!command){
                    res.end(JSON.stringify({error:"No command specified"}));
                    return;
                }
                aService.getCurrentUser(req, function (err, response) {
                    if (err) res.send(403, JSON.stringify({error: 'Forbidden'}));
                    else {
                        switch(command){
                            case 'restart': {
                                sysApi.farmrestart(names[0], names[1], function (err, results) {
                                    res.end(JSON.stringify(results));
                                });
                                return;
                            }
                            case 'stop': {
                                sysApi.farmstop(names[0], names[1], function (err, results) {
                                    res.end(JSON.stringify(results));
                                });
                                return;
                            }
                            case 'start': {
                                sysApi.farmstart(names[0], names[1], function (err, results) {
                                    res.end(JSON.stringify(results));
                                });
                                return;
                            }
                            case 'reboot': {
                                sysApi.reboot(names[0], names[1], function (err, results) {
                                    res.end(JSON.stringify(results));
                                });
                                return;
                            }
                            default:
                                res.end(JSON.stringify("Bad command"));
                        }
                    }
                });
                return;
            }
            case 'pendingpayouts': {
                if (portalConfig.website
                    && portalConfig.website.adminCenter
                    && portalConfig.website.adminCenter.enabled){
                    aService.getCurrentUser(req, function (err, response) {
                        if (err) res.send(403, JSON.stringify({error: 'Forbidden'}));
                        else {
                            portalPayouts.getPendingPayouts("ethereum", function (response) {
                                res.end(JSON.stringify(response));
                            });
                        }
                    });
                } else
                    res.send(403, JSON.stringify({error: 'Forbidden'}));
                return;
            }
            case 'payto': {
                if (portalConfig.website
                    && portalConfig.website.adminCenter
                    && portalConfig.website.adminCenter.enabled){
                    aService.getCurrentUser(req, function (err, response) {
                        if (err) res.send(403, JSON.stringify({error: 'Forbidden'}));
                        else {
                            var transaction = req.body.transaction;
                            var coin = req.body.coin;
                            portalPayouts.sendPayment(coin, transaction, function (response) {
                                res.end(JSON.stringify(response));
                            });
                        }
                    });
                } else
                    res.send(403, JSON.stringify({error: 'Forbidden'}));
                return;
            }
            default:
                next();
        }
    };

    this.handleSystemApiRequest = function(req, res, next){
        if (req.body.secret !== crypto.createHmac('sha256', portalConfig.secret).update(portalConfig.salt).digest('hex')) {
            res.status(403);
            res.end(JSON.stringify({err: "Unauthorized"}));
            return
        }
        switch(req.params.method){
            case 'farmrestart': {
                var username = req.body.username;
                var worker = req.body.farmName;
                portalStats.addSysMessage(username, worker, tools.wrapMessage('restart'), function(result) {
                    res.end(JSON.stringify(result));
                });
                return;
            }
            case 'farmstop': {
                var username = req.body.username;
                var worker = req.body.farmName;
                portalStats.addSysMessage(username, worker, tools.wrapMessage('stop'), function(result) {
                    res.end(JSON.stringify(result));
                });
                return;
            }
            case 'farmstart': {
                var username = req.body.username;
                var worker = req.body.farmName;
                portalStats.addSysMessage(username, worker, tools.wrapMessage('start'), function(result) {
                    res.end(JSON.stringify(result));
                });
                return;
            }
            case 'reboot': {
                var username = req.body.username;
                var worker = req.body.farmName;
                portalStats.addSysMessage(username, worker, tools.wrapMessage('reboot'), function(result) {
                    res.end(JSON.stringify(result));
                });
                return;
            }
            case 'changeworker': {
                var username = req.body.username;
                var worker = req.body.farmName;
                var newworker = req.body.newworker;
                portalStats.addSysMessage(username, worker, tools.wrapMessage('changeworker',{newname:newworker}), function(result) {
                    res.end(JSON.stringify(result));
                });
                return;
            }
            case 'changefullname': {
                var username = req.body.username;
                var worker = req.body.farmName;
                var newname = req.body.newfullname;
                portalStats.addSysMessage(username, worker, tools.wrapMessage('changefullname',{newname:newname}), function(result) {
                    res.end(JSON.stringify(result));
                });
                return;
            }
            case 'coinswitch': {
                var username = req.body.username;
                var worker = req.body.farmName;
                var tocoin = req.body.tocoin;
                portalStats.addSysMessage(username, worker, tools.wrapMessage('coinswitch',{to:tocoin}), function(result) {
                    res.end(JSON.stringify(result));
                });
                return;
            }
            case 'minerreg': {
                var client = req.body.client;
                var coin = req.body.coin;
                var clienthash = req.body.clienthash;
                portalStats.regWorkerLiveStats(coin, client, clienthash, function(result) {
                    res.end(JSON.stringify(result));
                });
                return;
            }
            default:
                next();
        }
    };

    this.handleUserApiRequest = function(req, res, next){
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
        switch(req.params.method){
            case 'minerstat':{
                var login = req.body.login;
                var stat = req.body.stat;
                var coin = req.body.coin || "ethereum";
                var time = req.body.time;
                portalStats.setWorkerIPLiveStats(coin, login, time, stat, function(result) {
                    res.end(JSON.stringify(result));
                });
                return;
            }
            case 'messages':{
                var login = req.body.login;
                portalStats.getNewMessages(login, function(result) {
                    res.end(JSON.stringify(result));
                });
                return;
            }
            case 'register': {
                var login = req.body.login;
                var password = req.body.password;
                var refcode = req.body.refcode;
                uService.registerUser(login, password, refcode, res, this.stats, function (response) {
                    res.end(JSON.stringify(response));
                });
                return;
            }
            case 'login': {
                var login = req.body.login;
                var password = req.body.password;
                var confcode = req.body.confcode;
                var remember = req.body.remember;
                uService.loginUser(login, password, confcode, remember, res, this.stats, function (response) {
                    res.end(JSON.stringify(response));
                });
                return;
            }
            case 'checkUser': {
                uService.getCurrentUser(req, function (err, response) {
                    res.end(JSON.stringify({result: err ? false : true, error: err}));
                });
                return;
            }
            case 'logout': {
                uService.logoutUser(req, res, function (err) {
                    res.end(JSON.stringify({result: err ? false : true, error: err}));
                });
                return;
            }
            case 'getuserinfo': {
                uService.getCurrentUser(req, function (err, response) {
                    var login = response.name || req.body.login;
                    var password = response.data.password || tools.hidePwd(req.body.password);
                    _this.stats.getUserInfo(login, password, function (response) {
                        res.end(JSON.stringify(response));
                    });
                });
                return;
            }
            case 'getuserbalance': {
                uService.getCurrentUser(req, function (err, response) {
                    var login = response.name || req.body.login;
                    var password = response.data.password || tools.hidePwd(req.body.password);
                    _this.stats.getUserBalance(login, password, function (response) {
                        res.end(JSON.stringify(response));
                    });
                });
                return;
            }
            case 'addwallet': {
                var coin = req.body.coin;
                var wallets = {};
                var walletStr = JSON.parse(req.body.wallets);
                Object.keys(poolConfigs).forEach(function(coin) {
                    wallets[coin] = walletStr[coin.replace(/\s/gi,'')]
                });
                var minPayments = {};
                var minPaymentStr = JSON.parse(req.body.settings || "{}");
                Object.keys(poolConfigs).forEach(function(coin) {
                    minPayments[coin] = minPaymentStr[coin.replace(/\s/gi,'')]
                });
                var confcode = req.body.confcode;
                uService.getCurrentUser(req, function (err, response) {
                    var login = response.name || req.body.login;
                    var password = response.data.password || tools.hidePwd(req.body.password);
                    _this.stats.addWallet(login, password, wallets, minPayments, confcode, function (response) {
                        res.end(JSON.stringify(response));
                    });
                });
                return;
            }
            case 'addtelegram': {
                var telegram = req.body.telegram;
                uService.getCurrentUser(req, function (err, response) {
                    var login = response.name || req.body.login;
                    var password = response.data.password || tools.hidePwd(req.body.password);
                    _this.stats.addTelegram(login, password, telegram, function (response) {
                        res.end(JSON.stringify(response));
                    });
                });
                return;
            }
            case 'livestats': {
                uService.getCurrentUser(req, function (err, response) {
                    var login = response.name || req.body.login;
                    _this.stats.getUserLiveStats(login, function (response) {
                        res.end(JSON.stringify(response));
                    });
                });
                return;
            }

            case 'historystats': {
                uService.getCurrentUser(req, function (err, response) {
                    var login = response.name || req.body.login;
                    _this.stats.getUserHistoryStats(login, function (response) {
                        res.end(JSON.stringify(response));
                    });
                });
                return;
            }

            case 'liveconnect': {
                var connectionhash = req.body.connectionhash;
                uService.getCurrentUser(req, function (err, response) {
                    _this.stats.getConnectionLiveStats(connectionhash, function (response) {
                        res.end(JSON.stringify(response));
                    });
                });

                return;
            }

            case 'farm': {
                var farmName = req.body.farmName || '';
                uService.getCurrentUser(req, function (err, response) {
                    var login = response.name || req.body.login;
                    var password = response.data.password || tools.hidePwd(req.body.password);
                    _this.stats.getUserFarms(login, password, farmName, function (response) {
                        res.end(JSON.stringify(response));
                    });
                });
                return;
            }

            case 'payouts': {
                var coin = req.body.coin;
                if (!coin){
                    res.end(JSON.stringify({error:"No coin specified",dataArray:null}));
                    return;
                }
                uService.getCurrentUser(req, function (err, response) {
                    var login = response.name || req.body.login;
                    var password = response.data.password || tools.hidePwd(req.body.password);
                    _this.stats.getUserPayouts(login, password, coin, function (response) {
                        res.end(JSON.stringify(response));
                    });
                });
                return;
            }

            case 'coinswitch': {
                var tocoin = req.body.coin;
                var names = tools.parseName(req.body.farm);
                uService.getCurrentUser(req, function (err, response) {
                    var login = response.name || req.body.login;
                    var password = response.data.password || tools.hidePwd(req.body.password);
                    _this.stats.checkCoinSwitchAccess(login, password, names, tocoin, function (isCanSwitch) {
                        if (isCanSwitch)
                            sysApi.coinswitch(login, names[1], tocoin, function (err, results) {
                                res.end(JSON.stringify(results));
                            });
                        else res.end(JSON.stringify("Access error or already mining this coin"));
                    });
                });
                return;
            }

            case 'command': {
                var command = req.body.command;
                var names = tools.parseName(req.body.farm);
                if (!command){
                    res.end(JSON.stringify({error:"No command specified"}));
                    return;
                }
                uService.getCurrentUser(req, function (err, response) {
                    var login = response.name || req.body.login;
                    var password = response.data.password || tools.hidePwd(req.body.password);
                    _this.stats.checkBaseCommandAccess(login, password, names, function (isHaveAccess) {
                        if (isHaveAccess)
                            switch(command){
                                case 'restart': {
                                    sysApi.farmrestart(login, names[1], function (err, results) {
                                        res.end(JSON.stringify(results));
                                    });
                                    return;
                                }
                                case 'stop': {
                                    sysApi.farmstop(login, names[1], function (err, results) {
                                        res.end(JSON.stringify(results));
                                    });
                                    return;
                                }
                                case 'start': {
                                    sysApi.farmstart(login, names[1], function (err, results) {
                                        res.end(JSON.stringify(results));
                                    });
                                    return;
                                }
                                case 'reboot': {
                                    sysApi.reboot(login, names[1], function (err, results) {
                                        res.end(JSON.stringify(results));
                                    });
                                    return;
                                }
                                default:
                                    res.end(JSON.stringify("Bad command"));
                            }
                        else res.end(JSON.stringify("Access error"));
                    });
                });
                return;
            }

            case 'settings': {
                var tfauth = req.body.tfauth || 'none';
                var confcode = req.body.confcode;
                uService.getCurrentUser(req, function (err, response) {
                    var login = response.name || req.body.login;
                    var password = response.data.password || tools.hidePwd(req.body.password);
                    _this.stats.updateUserSettings(login, password, {tfauth:tfauth}, confcode, function (response) {
                        res.end(JSON.stringify(response));
                    });
                });
                return;
            }

            case 'lastpayouts': {
                uService.getCurrentUser(req, function (err, response) {
                    var login = response.name || req.body.login;
                    var password = response.data.password || tools.hidePwd(req.body.password);
                    _this.stats.getUserLastPayouts(login, password, function (response) {
                        res.end(JSON.stringify(response));
                    });
                });
                return;
            }

            default:
                next();
        }
    };
};