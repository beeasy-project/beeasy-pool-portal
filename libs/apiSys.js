let fs = require('fs');
let request = require('request');
let nonce   = require('nonce');
let crypto = require('crypto');

module.exports = function() {
    'use strict';

    //var portalConfig = JSON.parse(process.env.portalConfig);
    JSON.minify = JSON.minify || require("node-json-minify");
    let portalConfig = JSON.parse(JSON.minify(fs.readFileSync("config.json", {encoding: 'utf8'})));

    // Module dependencies

    // Constants
    let version         = '0.1.0',
        PUBLIC_API_URL  = portalConfig.website.protocol+'://'+portalConfig.website.host+'/api/sys',
        PRIVATE_API_URL = portalConfig.website.protocol+'://'+portalConfig.website.host+'/api/sys',
        USER_AGENT      = 'nomp/node-open-mining-portal';

    // Constructor
    function apiSys(){
    }

    // If a site uses non-trusted SSL certificates, set this value to false
    apiSys.STRICT_SSL = false;

    // Helper methods

    // Prototype
    apiSys.prototype = {


        constructor: apiSys(),
        _request: function(options, callback){
            if (!('headers' in options)){
                options.headers = {};
            }

            options.headers['User-Agent'] = USER_AGENT;
            options.json = true;
            options.strictSSL = apiSys.STRICT_SSL;

            request(options, function(err, response, body) {
                callback(err, body);
            });

            return this;
        },

        // Make a public API request
        _public: function(parameters, callback){
            let options = {
                method: 'GET',
                url: PUBLIC_API_URL,
                qs: parameters
            };

            return this._request(options, callback);
        },

        // Make a private API request
        _private: function(method, parameters, callback){
            let options;

            parameters.nonce = nonce();
            options = {
                method: 'POST',
                url: PRIVATE_API_URL + "/" + method,
                body: parameters
            };

            return this._request(options, callback);
        },

        farmrestart: function(userName, farmName, callback){
            let parameters = {
                username: userName,
                farmName: farmName,
                secret : crypto.createHmac('sha256', portalConfig.secret).update(portalConfig.salt).digest('hex')
            };

            return this._private("farmrestart", parameters, callback);
        },

        farmstop: function(userName, farmName, callback){
            let parameters = {
                username: userName,
                farmName: farmName,
                secret : crypto.createHmac('sha256', portalConfig.secret).update(portalConfig.salt).digest('hex')
            };

            return this._private("farmstop", parameters, callback);
        },

        farmstart: function(userName, farmName, callback){
            let parameters = {
                username: userName,
                farmName: farmName,
                secret : crypto.createHmac('sha256', portalConfig.secret).update(portalConfig.salt).digest('hex')
            };

            return this._private("farmstart", parameters, callback);
        },

        reboot: function(userName, farmName, callback){
            let parameters = {
                username: userName,
                farmName: farmName,
                secret : crypto.createHmac('sha256', portalConfig.secret).update(portalConfig.salt).digest('hex')
            };

            return this._private("reboot", parameters, callback);
        },

        changeworker: function(userName, farmName, newName, callback){
            let parameters = {
                username: userName,
                farmName: farmName,
                newworker: newName,
                secret : crypto.createHmac('sha256', portalConfig.secret).update(portalConfig.salt).digest('hex')
            };

            return this._private("changeworker", parameters, callback);
        },

        changefullname: function(userName, farmName, newName, callback){
            let parameters = {
                username: userName,
                farmName: farmName,
                newfullname: newName,
                secret: crypto.createHmac('sha256', portalConfig.secret).update(portalConfig.salt).digest('hex')
            };

            return this._private("changefullname", parameters, callback);
        },

        coinswitch: function(userName, farmName, tocoin, callback){
            let parameters = {
                username: userName,
                farmName: farmName,
                tocoin: tocoin,
                secret: crypto.createHmac('sha256', portalConfig.secret).update(portalConfig.salt).digest('hex')
            };

            return this._private("coinswitch", parameters, callback);
        },

        userfarms: function(login, password, farmName, callback){
            let parameters = {
                login: login,
                password : password,
                secret: crypto.createHmac('sha256', portalConfig.secret).update(portalConfig.salt).digest('hex')
            };
            if (farmName) parameters.farmName = farmName;

            return this._private("farm", parameters, callback);
        },

        userbalance: function(login, password, callback){
            let parameters = {
                login: login,
                password : password,
                secret: crypto.createHmac('sha256', portalConfig.secret).update(portalConfig.salt).digest('hex')
            };

            return this._private("getuserbalance", parameters, callback);
        },

        lastpayouts: function(login, password, callback){
            let parameters = {
                login: login,
                password : password,
                secret: crypto.createHmac('sha256', portalConfig.secret).update(portalConfig.salt).digest('hex')
            };

            return this._private("lastpayouts", parameters, callback);
        },

        telegramuserlist: function(callback){
            let parameters = {
                secret: crypto.createHmac('sha256', portalConfig.secret).update(portalConfig.salt).digest('hex')
            };

            return this._private("telegramuserlist", parameters, callback);
        }
    };

    return apiSys;
}();
