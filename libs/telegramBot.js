const Telegraf = require('telegraf');

let async = require('async');
let redis = require('redis');
let api = require('./api.js');
let apiuser = require('./apiUser.js');
let apisys = require('./apiSys.js');
const tools = require('./addtools.js');
//let models  = require('../models');

module.exports = function(logger ){
    let poolConfigs = JSON.parse(process.env.pools);
    let portalConfig = JSON.parse(process.env.portalConfig);

    let portalApi = new api(logger, portalConfig, poolConfigs);
    let userApi = new apiuser();
    let sysApi = new apisys();
    let portalStats = portalApi.stats;

    let redisConfig = portalConfig.redis;


    let forkId = process.env.forkId;
    let logSystem = 'Monitor';
    let logComponent = 'local';
    let logSubCat = 'Thread ' + (parseInt(forkId) + 1);

    let redisClient = redis.createClient(redisConfig.port, redisConfig.host);

    let admins = {};
    let users = {};
    setTimeout(function() {
        sysApi.telegramuserlist(function (err, results) {
            if (err || !results) return;
            results.forEach(function (user) {
                users[user.userdata.telegram] = {login: user.userdata.name, password: user.userdata.pass};
            })
        });
        portalStats.getAdminTelegrams(function (results, err) {
            if (err)
                logger.debug(logSystem, logComponent, logSubCat, 'Error: ' + err);
            else {
                results.forEach(function (telegramId) {
                    admins[telegramId] = {login : 'admin', password : ''};
                });
            }
        });
    },1000);

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

    const tg = new Telegraf(portalConfig.telegram.telegramkey);

    tg.command('start', ({from, reply}) => {
        reply('Welcome ' + from.first_name);
        if (typeof users[from.id] === "undefined")
            reply('To start using me u must be logged in. Just use "/login name password" command.\nFor additional information use /help command just after logged in.');
        else
            reply('For additional information use /help command.')
    });

    tg.command('help', ({from, reply}) => {
        if (typeof users[from.id] === "undefined" && typeof admins[from.id] === "undefined")
            reply('To start using me u must be logged in. Just use "/login name password" command.');
        else
        {
            reply('Let me introduce some information about my functions.'
                    +'\n\nUsing my smart interface u can easy receive all important data about your mining farms.'
                    +'\nIf u want to receive current statistics just type /stat\nIf u want to remote restart one of your mining farm just use "/restart farmname" command'
                    +'\nIf u want to do remote stop one of your mining farm just use "/farmstop farmname" command\nIf u want to do remote start one of your mining farm just use "/farmstart farmname" command'
                    +'\nIf u want to do remote reboot your computer just use "/reboot farmname" command\nFor log out use /logout'
                    +'\n\nIn additional, you will be receive alerts about various critical states of your farms.');
        }
    });

    tg.command('admin', ({from, reply, update, updateType, updateSubType}) => {
        let command = update.message.text.split(' ');
        if( command.length < 2 ) return reply("Please use /admin password");
        if( typeof admins[from.id] !== "undefined") return reply("You are already admin");
        portalStats.loginAdmin('admin', command[1], function (response) {
            if (response.result === true ) {
                admins[from.id] = {login : 'admin', password : command[1]};
                portalStats.setAdminTelegram('admin', command[1], from.id, function(err, response){});
                return reply(from.first_name + ' you are admin now', {
                    reply_markup: {
                        keyboard: [[{text:"/stat"},{text:"/list"}],[{text:"/help"},{text:"/logout"}]]
                    }
                });
            }
            return reply(response.error);
        });
    });

    tg.command('login', ({from, reply, update, updateType, updateSubType}) => {
        let command = update.message.text.split(' ');
        if( command.length < 3 ) return reply("Please use /login login password");
        if( typeof users[ command[1] ] !== "undefined") return reply("You are already connected");

        userApi.login(command[1], command[2], function(err, response){
            if (!response) return reply(err);
            if (response.result === true ) {
                users[from.id] = {login : command[1], password : tools.hidePwd(command[2])};
                userApi.telegram(command[1], command[2], from.id, function(err, response){});
                return reply("Welcome, " + from.first_name + '!', {
                    reply_markup: {
                        keyboard: [[{text:"/stat"},{text:"/myfarms"}],[{text:"/balance"},{text:"/lastpayments"}],[{text:"/help"},{text:"/logout"}]]
                    }
                });
            }
            return reply(response.error);
        });
    });

    tg.command('logout', ({from, reply, update, updateType, updateSubType}) => {

        let command = update.message.text.split(' ');

        if( command.length !== 1 ) return reply("Please use /logout");
        if( typeof users[ from.id ] === "undefined" && typeof admins[ from.id ] === "undefined") return reply("You are not connected");
        delete users[from.id];
        delete admins[from.id];
        return reply("Bye, " + from.first_name + '!', {
            reply_markup: {
                remove_keyboard: true
            }
        });

    });

    tg.command('stat', ({from, reply, update, updateType, updateSubType}) => {
        let command = update.message.text.split(' ');

        if (typeof admins[from.id] === "undefined" && typeof users[from.id] === "undefined"  )
            return reply("You are not logged in!");

        if (typeof admins[from.id] !== "undefined") {
            portalStats.getLiveStats('', 0, 1, function (err, results) {
                let cumulativeHashrate = 0;
                let replydata = '';
                results.forEach(function(farm) {
                    let userdata = JSON.parse(farm.value);
                    if (userdata.status !== 1) return;
                    replydata += '\n\n' + userdata.Name;
                    if (userdata.Stat !== undefined) {
                        if (userdata.Stat.hashrate !== undefined) {
                            replydata = replydata + " HashRate :" + userdata.Stat.hashrate;
                            cumulativeHashrate += parseFloat(userdata.Stat.hashrate);
                        }
                        if (userdata.Stat.gpuhashrate !== undefined)
                            replydata = replydata + "[" + userdata.Stat.gpuhashrate.toString();
                        if (userdata.Stat.temperature !== undefined)
                            replydata = replydata + "] Temp[" + userdata.Stat.temperature.toString();
                        if (userdata.Stat.speed !== undefined)
                            replydata = replydata + "] Fan[" + userdata.Stat.speed.toString() + "]";
                        if (typeof userdata.curcoin !== "undefined")
                            replydata = replydata + " Now mining:" + userdata.curcoin;
                        if (typeof userdata.Time !== "undefined")
                            replydata = replydata + ".\nData was received " + Math.floor((Date.now() - userdata.Time) / 1000) + " sec. ago";
                    }
                });
                replydata += '\n\nИтого общий хешрейт: ' + cumulativeHashrate;
                reply(replydata);
            });
        } else if (typeof users[from.id] !== "undefined") {
            userApi.livestats(users[from.id].login, users[from.id].password, function (err, results) {
                let cumulativeHashrate = 0;
                let replydata = '';
                for (let r in results.result) {
                    let userdata = JSON.parse(results.result[r]);
                    replydata += '\n\n' + userdata.Name;
                    if (userdata.Stat !== undefined) {
                        if (userdata.Stat.hashrate !== undefined) {
                            replydata = replydata + " HashRate :" + userdata.Stat.hashrate;
                            cumulativeHashrate += parseFloat(userdata.Stat.hashrate);
                        }
                        if (userdata.Stat.gpuhashrate !== undefined)
                            replydata = replydata + "[" + userdata.Stat.gpuhashrate.toString();
                        if (userdata.Stat.temperature !== undefined)
                            replydata = replydata + "] Temp[" + userdata.Stat.temperature.toString();
                        if (userdata.Stat.speed !== undefined)
                            replydata = replydata + "] Fan[" + userdata.Stat.speed.toString() + "]";
                        if (typeof userdata.curcoin !== "undefined")
                            replydata = replydata + " Now mining:" + userdata.curcoin;
                        if (typeof userdata.Time !== "undefined")
                            replydata = replydata + ".\nData was received " + Math.floor((Date.now() - userdata.Time) / 1000) + " sec. ago";
                    }
                }
                replydata += '\n\nИтого общий хешрейт: ' + cumulativeHashrate;
                reply(replydata);
            });
        }
    });

    tg.command('restart', ({from, reply, update}) => {
        let command = update.message.text.split(' ');
        if( typeof users[ from.id ] === "undefined") return reply("You are not logged in. Please /login");
        if( command.length !== 2 ) return reply("Please use /restart farmname");

        async.waterfall([
            function(callback){
                farmrestart(false, users[from.id].login, users[from.id].password, command[1], callback);
        }], function(result){
            reply(result);
        });
    });

    tg.command('farmstop', ({from, reply, update}) => {
        let command = update.message.text.split(' ');
        if( typeof users[ from.id ] === "undefined") return reply("You are not logged in. Please /login");
        if( command.length !== 2 ) return reply("Please use /farmstop farmname");

        async.waterfall([
            function(callback){
                farmstop(false, users[from.id].login, users[from.id].password, command[1], callback);
        }], function(result){
            reply(result);
        });
    });

    tg.command('farmstart', ({from, reply, update}) => {
        let command = update.message.text.split(' ');
        if( typeof users[ from.id ] === "undefined") return reply("You are not logged in. Please /login");
        if( command.length !== 2 ) return reply("Please use /farmstart farmname");

        async.waterfall([
            function(callback){
                farmstart(false, users[from.id].login, users[from.id].password, command[1], callback);
        }], function(result){
            reply(result);
        });
    });

    tg.command('reboot', ({from, reply, update}) => {
        let command = update.message.text.split(' ');
        if( typeof users[ from.id ] === "undefined") return reply("You are not logged in. Please /login");
        if( command.length !== 2 ) return reply("Please use /reboot/ farmname");

        async.waterfall([
            function(callback){
                farmreboot(false, users[from.id].login, users[from.id].password, command[1], callback);
        }], function(result){
            reply(result);
        });
    });

    tg.command('myfarms', ({from, reply, update}) => {
        if( typeof users[from.id] === "undefined" ) return reply("You are not logged in. Please /login");

        sysApi.userfarms(users[from.id].login, users[from.id].password, '', function (err, results) {

            if (results.error) return reply(results.error);

            let inlineButtons = [];
            for (index = 0; index < results.dataArray.length; ++index) {
                inlineButtons.push([{text: results.dataArray[index], callback_data: "farm "+results.dataArray[index]}])
            }

            tg.telegram.sendMessage(from.id, "Choose your farm:", {
                reply_markup: {
                    inline_keyboard: inlineButtons
                }
            })
        });
    });

    tg.command('balance', ({from, reply}) => {
        if( typeof users[from.id] === "undefined" ) return reply("You are not logged in. Please /login");

        sysApi.userbalance(users[from.id].login, users[from.id].password, function (err, results) {

            if (results.error) return reply(results.error);

            let replyStr = '';
            Object.keys(results.result.balance).forEach(function(coin) {
                replyStr += coin + ': ' + results.result.balance[coin].balance + ' ' + results.result.balance[coin].sym + '\n';
            });
            reply(replyStr);
        });
    });

    tg.command('lastpayments', ({from, reply}) => {
        if( typeof users[from.id] === "undefined" ) return reply("You are not logged in. Please /login");

        sysApi.lastpayouts(users[from.id].login, users[from.id].password, function (err, results) {

            if (results.error) return reply(results.error);

            let replyStr = '';
            results.dataArray.forEach(function(payment) {
                replyStr += new Date(payment.time*1000).toLocaleString() + ' : ' + payment.coin + ' : ' + payment.amount + ' : <a href="https://etherscan.io/tx/' + payment.tx + '" target="_blank">' + payment.tx + '</a>\n';
            });
            tg.telegram.sendMessage(from.id, replyStr, {parse_mode:"HTML"});
        });
    });

    tg.action(/^farm .+/, ({from, reply, update, updateType, updateSubType}) => {
        let farmname = update.callback_query.data.split(' ');
        if( typeof users[from.id] === "undefined" ) return reply("You are not logged in. Please /login");

        if( farmname.length !== 2 ) return reply("Error in query.");
        else  farmname = farmname[1];

        tg.telegram.sendMessage(from.id, "Choose your action for "+farmname+":", {
            reply_markup: {
                inline_keyboard: [[{text: '/farmstart', callback_data: "action "+farmname+" farmstart"},{text: '/farmstop', callback_data: "action "+farmname+" farmstop"}],
                                  [{text: '/restart', callback_data: "action "+farmname+" restart"},{text: '/reboot', callback_data: "action "+farmname+" reboot"}]]
            }
        })
    });

    tg.action(/^action .+/, ({from, reply, update, updateType, updateSubType}) => {
        let command = update.callback_query.data.split(' ');
        if( typeof users[ from.id ] === "undefined") return reply("You are not logged in. Please /login");
        if( command.length !== 3 ) return reply("Error in query.");

        async.waterfall([
            function(callback){
                switch (command[2]) {
                    case "farmstart":
                        return farmstart(false, users[from.id].login, users[from.id].password, command[1], callback);
                    case "farmstop":
                        return farmstop(false, users[from.id].login, users[from.id].password, command[1], callback);
                    case "restart":
                        return farmrestart(false, users[from.id].login, users[from.id].password, command[1], callback);
                    case "reboot":
                        return farmreboot(false, users[from.id].login, users[from.id].password, command[1], callback);
                    default:
                        return callback("Error in query.")
                }
        }], function(result){
            reply(result);
        });
    });

    tg.startPolling();

    let farmreboot = function (isAdmin, login, password, farmname, callback) {
        if (isAdmin){
            sysApi.reboot(login, farmname, function (err, results) {
                return callback(results);
            });
        } else {
            sysApi.userfarms(login, password, farmname, function (err, results) {

                if (results.error) return callback(results.error);

                if (results.dataArray.indexOf(farmname) !== -1) {
                    sysApi.reboot(login, farmname, function (err, results) {
                        return callback(results);
                    });
                } else
                    return callback("Sorry you haven`t farm with this name. Please check your command.");
            })
        }
    };

    let farmstart = function (isAdmin, login, password, farmname, callback) {
        if (isAdmin){
            sysApi.farmstart(login, farmname, function (err, results) {
                return callback(results);
            });
        } else {
            sysApi.userfarms(login, password, farmname, function (err, results) {

                if (results.error) return callback(results.error);

                if (results.dataArray.indexOf(farmname) !== -1) {
                    sysApi.farmstart(login, farmname, function (err, results) {
                        return callback(results);
                    });
                } else
                    return callback("Sorry you haven`t farm with this name. Please check your command.");
            });
        }
    };

    let farmstop = function (isAdmin, login, password, farmname, callback) {
        if (isAdmin){
            sysApi.farmstop(login, farmname, function (err, results) {
                return callback(results);
            });
        } else {
            sysApi.userfarms(login, password, farmname, function (err, results) {

                if (results.error) return callback(results.error);

                if (results.dataArray.indexOf(farmname) !== -1) {
                    sysApi.farmstop(login, farmname, function (err, results) {
                        return callback(results);
                    });
                } else
                    return callback("Sorry you haven`t farm with this name. Please check your command.");
            });
        }
    };

    let farmrestart = function (isAdmin, login, password, farmname, callback) {
        if (isAdmin){
            sysApi.farmrestart(login, farmname, function (err, results) {
                return callback(results);
            });
        } else {
            sysApi.userfarms(login, password, farmname, function (err, results) {

                if (results.error) return callback(results.error);

                if (results.dataArray.indexOf(farmname) !== -1) {
                    sysApi.farmrestart(login, farmname, function (err, results) {
                        return callback(results);
                    });
                } else
                    return callback("Sorry you haven`t farm with this name. Please check your command.");
            });
        }
    };

    tg.command('list', ({from, reply, update}) => {
        if( typeof admins[from.id] === "undefined" ) return reply("You are not logged in. Please login as administrator");

        portalStats.getFarmlist(function (results) {
            if (results.error) return reply(results.error);

            let inlineButtons = [];
            for (index = 0; index < results.dataArray.length; ++index) {
                if (results.dataArray[index][1] !== ''){
                    inlineButtons.push([{text: results.dataArray[index][0], callback_data: "admfarm "+results.dataArray[index][0]+" "+results.dataArray[index][1]}])
                }
            }

            tg.telegram.sendMessage(from.id, "Choose your farm:", {
                reply_markup: {
                    inline_keyboard: inlineButtons
                }
            })
        });
    });

    tg.action(/^admfarm .+/, ({from, reply, update, updateType, updateSubType}) => {
        let names = update.callback_query.data.split(' ');
        let username, farmname = '';
        if( typeof admins[from.id] === "undefined" ) return reply("You are not logged in. Please login as administrator");

        if( names.length !== 3 ) return reply("Error in query.");
        else {
            username = names[1];
            farmname = names[2];
        }

        tg.telegram.sendMessage(from.id, "Choose your action for "+farmname+":", {
            reply_markup: {
                inline_keyboard: [[{text: '/farmstart', callback_data: "admaction "+username+" "+farmname+" farmstart"},{text: '/farmstop', callback_data: "admaction "+username+" "+farmname+" farmstop"}],
                    [{text: '/restart', callback_data: "admaction "+username+" "+farmname+" restart"},{text: '/reboot', callback_data: "admaction "+username+" "+farmname+" reboot"}]]
            }
        })
    });

    tg.action(/^admaction .+/, ({from, reply, update, updateType, updateSubType}) => {
        let command = update.callback_query.data.split(' ');
        if( typeof admins[from.id] === "undefined" ) return reply("You are not logged in. Please login as administrator");
        if( command.length !== 4 ) return reply("Error in query.");

        async.waterfall([
            function(callback){
                switch (command[3]) {
                    case "farmstart":
                        return farmstart(true, command[1], '', command[2], callback);
                    case "farmstop":
                        return farmstop(true, command[1], '', command[2], callback);
                    case "restart":
                        return farmrestart(true, command[1], '', command[2], callback);
                    case "reboot":
                        return farmreboot(true, command[1], '', command[2], callback);
                    default:
                        return callback("Error in query.")
                }
        }], function(result){
            reply(result);
        });
    });

    process.on("message", function(msg){
        if( msg.type === "mineralert" )
        {
            portalStats.getUserTelegram(msg.client,function (results, err) {
                if (err)
                    logger.debug(logSystem, logComponent, logSubCat, 'Error: ' + err);
                else
                    tg.telegram.sendMessage(results.telegram,msg.message);
            });
            portalStats.getAdminTelegrams(function (results, err) {
                if (err)
                    logger.debug(logSystem, logComponent, logSubCat, 'Error: ' + err);
                else {
                    results.forEach(function (telegramId) {
                        tg.telegram.sendMessage(telegramId, msg.message);
                    });
                }
            });
        }

    });

    let resendConfirmations = function()
    {
        sysApi.telegramuserlist(function (err, results) {
            if (err) return;
            async.each(results, function(user, callback){
                portalStats.getNewConfirmationCodes(user.userdata, function (codes) {
                    codes.forEach(function (code) {
                        tg.telegram.sendMessage(user.userdata.telegram, 'new confirmation code: '+code+' \nWill expire in 2 minutes.');
                    });
                });
                portalStats.getNewPaymentsNotice(user.userdata, function (err, payments) {
                    if (err) return;
                    let replyStr = 'You receive new payments:\n';
                    payments.forEach(function(payment) {
                        replyStr += new Date(payment.time*1000).toLocaleString() + ' : ' + payment.coin + ' : ' + payment.amount + ' : <a href="https://etherscan.io/tx/' + payment.tx + '" target="_blank">' + payment.tx + '</a>\n';
                    });
                    tg.telegram.sendMessage(user.userdata.telegram, replyStr, {parse_mode:"HTML"});
                });
                portalStats.getNewRecoverCodes(user.userdata, function (codes) {
                    let replyStr = 'Был получен запрос на восстановление пароля. Если вы не делали этого просто проигнорируйте это сообщение.\nДля восстановления пароля перйдите по ссылке. Ссылка будет действительна в течении 5 минут.\nВ любом случае мы рекомендуем использовать двухфакторную авторизацию для лучшей безопастности.\n';
                    codes.forEach(function (code) {
                        tg.telegram.sendMessage(user.userdata.telegram, replyStr + '<a href="https://easypool.me/passreset/' + code + '" target="_blank">Сбросить пароль</a>', {parse_mode:"HTML"});
                    });
                });
                callback();
            },function(err) {
            });
        })
    };
    setInterval(resendConfirmations, 10 * 1000);

/*
    //use this for quick test console
    tg.hears('hi',({from, reply, update, updateType, updateSubType}) => {
        models.User.findAll({include: [{association: models.Ubalance.associations.Balance}]}).then( users => {
            reply(users)
        })
    });
*/
};