const fs = require('fs');
const uuid = require('uuid/v4');
const async = require('async');
const tools = require('./addtools.js');
var models  = require('../models');

module.exports = function() {
    'use strict';

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
        createSession: function(admin_id, serviceCallback){
            var sGuid = uuid();
            var bExists = true;
            async.whilst(
                function() { return bExists },
                function(callback) {
                    models.Asession.findOne({ where: {session: tools.hidePwd(sGuid)} }).then( session => {
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
                        models.Asession.create({ admin_id: admin_id, session: tools.hidePwd(sGuid) });
                        return serviceCallback(null,sGuid);
                    }
                    return serviceCallback('Cannot add new session',null)
                }
            );
        },
        deleteSession: function (sGuid) {
            models.Asession.destroy({ where: {session: tools.hidePwd(sGuid)} });
            return
        },
        restoreSession: function (sGuid, serviceCallback) {
            models.Asession.findOne({ where: {session: tools.hidePwd(sGuid)} }).then( session => {
                if( session === null ) {
                    return serviceCallback("No such admin", null)
                }
                return serviceCallback(null, session.admin_id)
            })
        },
        loginUser: function (login, password, remember, res, stats, serviceCallback) {
            stats.loginAdmin(login, password, function (response) {
                if (response.result) {
                    _this.createSession(response.adm.id, function (err, result) {
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
            _this.restoreSession(_this.getCookie(req), function (err, adm_id) {
                if (err) return serviceCallback(err, {name:null, data:{}});
                models.Admin.findById(adm_id).then( admin => {
                    if( admin === null ) {
                        return serviceCallback("No such admin", {name:null, data:{}});
                    }
                    serviceCallback(null, {name:admin.name, data:admin})
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