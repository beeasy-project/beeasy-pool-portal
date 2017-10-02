var request = require('request');
var nonce   = require('nonce');
var async = require('async');

module.exports = function() {
    'use strict';

    // Module dependencies

    // Constants
    var version         = '0.1.0',
        PUBLIC_API_URL  = 'https://api.etherscan.io/api',
        PRIVATE_API_URL = 'https://api.etherscan.io/api',
        USER_AGENT      = 'nomp/node-open-mining-portal';

    var apikey;
    var address;

    // Constructor
    function Etherscan(ApiKey, Address){
        apikey = ApiKey;
        address = Address;
    }

    // If a site uses non-trusted SSL certificates, set this value to false
    Etherscan.STRICT_SSL = false;

    // Prototype
    Etherscan.prototype = {
        constructor: Etherscan,

        // Make an API request
        _request: function(options, callback){
            if (!('headers' in options)){
                options.headers = {};
            }

            options.headers['User-Agent'] = USER_AGENT;
            options.json = true;
            options.strictSSL = Etherscan.STRICT_SSL;

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
        _private: function(parameters, callback){
            var options;

            parameters.nonce = nonce();
            options = {
                method: 'POST',
                url: PRIVATE_API_URL,
                form: parameters,
                headers: this._getPrivateHeaders(parameters)
            };

            return this._request(options, callback);
        },
        /////
        getBalance: function(callback){

            var parameters = {
                module : "account",
                action : "balance",
                address : address,
                tag : "latest",
                apikey : apikey
            };

            var options = {
                method: 'GET',
                url: PUBLIC_API_URL,
                qs: parameters
            };

            return this._request(options, function(err, body){
                var balance = parseInt(body.result).toString(16);
                var ret = {error: err, data: JSON.stringify({result: "0x" + balance, msg : body.message})};
                callback(ret);
            });
        },

        getTransaction: function(tx, callback){
            var parameters = {
                module : "proxy",
                action : "eth_getTransactionByHash",
                txhash : tx,
                apikey : apikey
            };

            var options = {
                method: 'GET',
                url: PUBLIC_API_URL,
                qs: parameters
            };

            return this._request(options, function(err, body){
                callback({error: err, response :body.result});
            });
        },

        getAccounts: function(callback){
                callback({error:null, response:[address]});
        },

        cmd : function(command, args, callback){
            if( command == "eth_accounts") {
                this.getAccounts( function(x){
                    callback(x);
                });
            }
            if( command == "eth_getTransactionByHash")
            {
                this.getTransaction(args[0], function(x){
                    callback(x);
                });
            }
            return;

        },

        batchCmd : function(commands, callback ){
            var results = [];
            var cl = this;

            async.forEach(commands, function(command, eachCallback){
                var itemFinished = function(result ){

                    var returnObj = {
                        error: result.error,
                        response: (result || {}).response
                    };
                    results.push(returnObj);
                    eachCallback();
                    itemFinished = function(){};
                };
                cl.cmd(command[0], command[1], itemFinished);
            }, function(err){
                callback(err, results);
            });
        }
    };

    return Etherscan;
}();