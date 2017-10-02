var fs = require('fs');
var request = require('request');
var nonce   = require('nonce');

module.exports = function() {
    'use strict';

    JSON.minify = JSON.minify || require("node-json-minify");
    var portalConfig = JSON.parse(JSON.minify(fs.readFileSync("config.json", {encoding: 'utf8'})));

    // Module dependencies

    // Constants
    var version         = '0.1.0',
        PUBLIC_API_URL  = portalConfig.website.protocol+'://'+portalConfig.website.host+'/api/user',
        PRIVATE_API_URL = portalConfig.website.protocol+'://'+portalConfig.website.host+'/api/user',
        USER_AGENT      = 'nomp/node-open-mining-portal';

    // Constructor
    function apiUser(){
    }

    // If a site uses non-trusted SSL certificates, set this value to false
    apiUser.STRICT_SSL = false;

    // Helper methods

    // Prototype
    apiUser.prototype = {


        constructor: apiUser(),
        _request: function(options, callback){
            if (!('headers' in options)){
                options.headers = {};
            }

            options.headers['User-Agent'] = USER_AGENT;
            options.json = true;
            options.strictSSL = apiUser.STRICT_SSL;

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

        login: function(login, password, callback){
            var parameters = {
                    login: login,
                    password : password,
                    confcode : 'wo'
                };

            return this._private("login", parameters, callback);
        },
        telegram: function(login, password, telegram, callback){
            var parameters = {
                login: login,
                password : password,
                telegram : telegram
            };

            return this._private("addtelegram", parameters, callback);
        },
        myfarms: function(login, password, farmName, callback){
            var parameters = {
                login: login,
                password : password
            };
            if (farmName) parameters.farmName = farmName;

            return this._private("farm", parameters, callback);
        },
        livestats: function(login, password, callback){
            var parameters = {
                login: login,
                password : password
            };

            return this._private("livestats", parameters, callback);
        },
        messages: function(login, callback){
            var parameters = {
                login: login
            };

            return this._private("messages", parameters, callback);
        }
    };

    return apiUser;
}();
