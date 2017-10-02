const fs = require('fs');
const uuid = require('uuid/v4');
const async = require('async');
const tools = require('./addtools.js');
var models  = require('../models');

module.exports = function() {
    'use strict';

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
        createSession: function(user_id, serviceCallback){
            var sGuid = uuid();
            var bExists = true;
            async.whilst(
                function() { return bExists },
                function(callback) {
                    models.Usession.findOne({ where: {session: tools.hidePwd(sGuid)} }).then( session => {
                        if( session !== null ) {
                            sGuid = uuid();
                        } else {
                            bExists = false;
                        }
                        callback(null);
                    })
                },
                function (err) {
                    if (!err) {
                        models.Usession.create({ user_id: user_id, session: tools.hidePwd(sGuid) });
                        return serviceCallback(null,sGuid);
                    }
                    return serviceCallback('Cannot add new session',null)
                }
            );
        },
        deleteSession: function (sGuid) {
            models.Usession.destroy({ where: {session: tools.hidePwd(sGuid)} });
            return
        },
        restoreSession: function (sGuid, serviceCallback) {
            models.Usession.findOne({ where: {session: tools.hidePwd(sGuid)} }).then( session => {
                if( session === null ) {
                    return serviceCallback("No such user", null)
                }
                return serviceCallback(null, session.user_id)
            })
        },
        registerUser: function (login, password, refcode, res, stats, serviceCallback) {
            stats.registerUser(login, password, refcode, function( response ){
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
                    _this.createSession(response.user.id, function (err, result) {
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
            _this.restoreSession(_this.getCookie(req), function (err, user_id) {
                if (err) return serviceCallback(err, {name:null, data:{}});
                models.User.findById(user_id).then( user => {
                    if( user === null ) {
                        return serviceCallback("No such user", {name:null, data:{}});
                    }
                    serviceCallback(null, {name:user.name, data:user})
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
