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
    const COOKIENAME        = 'asession',
          MAXAGEREMEMBER    = 2592000000,
          MAXAGENOREMEMBER  = 60 * 60 * 1000;

    // Constructor
    function admService(){
        _this = this;
    }

    // Prototype
    admService.prototype = {


        constructor: admService(),
        createSession: function(username, serviceCallback){
            var sGuid = uuid();
            var bExists = true;
            async.whilst(
                function() { return bExists },
                function(callback) {
                    redisClient.hget("admins:sessions", tools.hidePwd(sGuid), function (err, result) {
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
                        redisClient.hset("admins:sessions", tools.hidePwd(sGuid), username);
                        return serviceCallback(null,sGuid);
                    }
                    return serviceCallback('Cannot add new session',null)
                }
            );
        },
        deleteSession: function (sGuid) {
            redisClient.hdel("admins:sessions", tools.hidePwd(sGuid));
            return
        },
        restoreSession: function (sGuid, serviceCallback) {
            redisClient.hget("admins:sessions", tools.hidePwd(sGuid), function (err, result) {
                if( err || result === null ) {
                    return serviceCallback("No such admin", null)
                }
                return serviceCallback(null, result)
            });
        },
        loginUser: function (login, password, remember, res, stats, serviceCallback) {
            stats.loginAdmin(login, password, function (response) {
                if (response.result) {
                    _this.createSession(login, function (err, result) {
                        if (err) serviceCallback({result: null, error: err});
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
                redisClient.hget("admins", uname, function (err, result) {
                    if (err) return serviceCallback(err, {name:null, data:{}});
                    else if (!result) return serviceCallback("No such admin", {name:null, data:{}});

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

    return admService;
}();