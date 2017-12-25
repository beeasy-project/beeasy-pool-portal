const fs = require('fs');
const uuid = require('uuid/v4');
const async = require('async');
var redis = require('redis');
const tools = require('./addtools.js');

module.exports = function() {
    'use strict';

    JSON.minify = JSON.minify || require("node-json-minify");
    var portalConfig = JSON.parse(JSON.minify(fs.readFileSync("config.json", {encoding: 'utf8'})));
    var redisClient = redis.createClient(portalConfig.redis.port, portalConfig.redis.host);

    var _this;

    // Constants
    const COOKIENAME        = 'usession',
          MAXAGEREMEMBER    = 2592000000,
          MAXAGENOREMEMBER  = 60 * 60 * 1000;

    // Constructor
    function userService(){
        _this = this;
    }

    // Prototype
    userService.prototype = {


        constructor: userService(),
        createSession: function(username, serviceCallback){
            var sGuid = uuid();
            var bExists = true;
            async.whilst(
                function() { return bExists },
                function(callback) {
                    redisClient.hget("users:sessions", tools.hidePwd(sGuid), function (err, result) {
                        if( err || result !== null ) {
                            sGuid = uuid();
                        } else {
                            bExists = false;
                        }
                        callback(null);
                    });
                },
                function (err) {
                    if (!err) {
                        redisClient.hset("users:sessions", tools.hidePwd(sGuid), username);
                        return serviceCallback(null,sGuid);
                    }
                    return serviceCallback('Cannot add new session',null)
                }
            );
        },
        deleteSession: function (sGuid) {
            redisClient.hdel("users:sessions", tools.hidePwd(sGuid));
        },
        restoreSession: function (sGuid, serviceCallback) {
            redisClient.hget("users:sessions", tools.hidePwd(sGuid), function (err, result) {
                if( err || result === null ) {
                     return serviceCallback("No such user", null)
                }
                return serviceCallback(null, result)
            });
        },
        registerUser: function (login, password, refcode, res, stats, serviceCallback) {
            stats.registerUser(login, password, refcode, function( response ){
                if (response.result) {
                    _this.createSession(login, function (err, result) {
                        if (err) serviceCallback({result: null, error: err});
                        _this.setCookie(res, COOKIENAME, result, MAXAGENOREMEMBER);
                        serviceCallback(response);
                    });
                } else {
                    serviceCallback(response);
                }
            });
        },
        recoverUser: function (login, res, stats, serviceCallback) {
            stats.recoverUser(login, function( response ){
                serviceCallback(response);
            });
        },
        resetPassword: function (reccode, password, res, stats, serviceCallback) {
            stats.resetPassword(reccode, password, function( response ){
                if (response.result) {
                    _this.createSession(response.user_id, function (err, result) {
                        if (err) serviceCallback({result: null, error: err});
                        _this.setCookie(res, COOKIENAME, result, MAXAGENOREMEMBER);
                        serviceCallback(response);
                    });
                } else {
                    serviceCallback(response);
                }
            });
        },
        loginUser: function (login, password, confcode, remember, res, stats, serviceCallback) {
            stats.loginUser(login, password, confcode, function (response) {
                if (response.result) {
                    _this.createSession(login, function (err, result) {
                        if (err) serviceCallback({result: null, error: err, conf:response.conf});
                        _this.setCookie(res, COOKIENAME, result, remember ? MAXAGEREMEMBER : MAXAGENOREMEMBER);
                        serviceCallback(response);
                    });
                } else {
                    serviceCallback(response);
                }
            });
        },
        checkSession: function (req) {
            var bExist = false;
            Object.keys(req.cookies).forEach(function(cookie) {
                if (cookie === COOKIENAME) bExist = true
            });
            return bExist
        },
        getCurrentUser: function (req, serviceCallback) {
            if (!_this.checkSession(req)) return serviceCallback("No session", {name:null, data:{}});
            _this.restoreSession(_this.getCookie(req), function (err, uname) {
                if (err) return serviceCallback(err, {name:null, data:{}});
                redisClient.hget("users", uname, function (err, result) {
                    if (err) return serviceCallback(err, {name:null, data:{}});
                    else if (!result) return serviceCallback("No such user", {name:null, data:{}});

                    serviceCallback(null, {name:uname, data:JSON.parse(result)})
                })
            })
        },
        logoutUser: function (req, res, serviceCallback) {
            _this.deleteSession(_this.getCookie(req));
            _this.setCookie(res, COOKIENAME, '', MAXAGEREMEMBER);
            serviceCallback(null);
        },
        setCookie: function (res, sName, sValue, iTimeout) {
            res.cookie(sName, sValue, { maxAge: iTimeout });
        },
        getCookie: function (req) {
            return req.cookies[COOKIENAME]
        }
    };

    return userService;
}();
