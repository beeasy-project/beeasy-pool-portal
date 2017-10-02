var fs = require('fs');
var request = require('request');
var nonce   = require('nonce');
var crypto = require('crypto');

module.exports = function() {
    'use strict';

    //var portalConfig = JSON.parse(process.env.portalConfig);
    JSON.minify = JSON.minify || require("node-json-minify");
    var portalConfig = JSON.parse(JSON.minify(fs.readFileSync("config.json", {encoding: 'utf8'})));

    // Module dependencies

    // Constants
    var version         = '0.1.0',
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
            var options = {
                method: 'GET',
                url: PUBLIC_API_URL,
                qs: parameters
            };

            return this._request(options, callback);
        },

        // Make a private API request
        _private: function(method, parameters, callback){
            var options;

            parameters.nonce = nonce();
            options = {
                method: 'POST',
                url: PRIVATE_API_URL + "/" + method,
                body: parameters
            };

            return this._request(options, callback);
        },

        farmrestart: function(userName, farmName, callback){
            var parameters = {
                username: userName,
                farmName: farmName,
                secret : crypto.createHmac('sha256', portalConfig.secret).update(portalConfig.salt).digest('hex')
            };

            return this._private("farmrestart", parameters, callback);
        },

        farmstop: function(userName, farmName, callback){
            var parameters = {
                username: userName,
                farmName: farmName,
                secret : crypto.createHmac('sha256', portalConfig.secret).update(portalConfig.salt).digest('hex')
            };

            return this._private("farmstop", parameters, callback);
        },

        farmstart: function(userName, farmName, callback){
            var parameters = {
                username: userName,
                farmName: farmName,
                secret : crypto.createHmac('sha256', portalConfig.secret).update(portalConfig.salt).digest('hex')
            };

            return this._private("farmstart", parameters, callback);
        },

        reboot: function(userName, farmName, callback){
            var parameters = {
                username: userName,
                farmName: farmName,
                secret : crypto.createHmac('sha256', portalConfig.secret).update(portalConfig.salt).digest('hex')
            };

            return this._private("reboot", parameters, callback);
        },

        changeworker: function(userName, farmName, newName, callback){
            var parameters = {
                username: userName,
                farmName: farmName,
                newworker: newName,
                secret : crypto.createHmac('sha256', portalConfig.secret).update(portalConfig.salt).digest('hex')
            };

            return this._private("changeworker", parameters, callback);
        },

        changefullname: function(userName, farmName, newName, callback){
            var parameters = {
                username: userName,
                farmName: farmName,
                newfullname: newName,
                secret: crypto.createHmac('sha256', portalConfig.secret).update(portalConfig.salt).digest('hex')
            };

            return this._private("changefullname", parameters, callback);
        },

        coinswitch: function(userName, farmName, tocoin, callback){
            var parameters = {
                username: userName,
                farmName: farmName,
                tocoin: tocoin,
                secret: crypto.createHmac('sha256', portalConfig.secret).update(portalConfig.salt).digest('hex')
            };

            return this._private("coinswitch", parameters, callback);
        }
    };

    return apiSys;
}();
