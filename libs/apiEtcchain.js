var request = require('request');
var nonce   = require('nonce');
var async = require('async');

module.exports = function() {
    'use strict';

    // Module dependencies

    // Constants
    var version         = '0.1.0',
        PUBLIC_API_URL  = 'https://etcchain.com/api/v1',
        PROXY_API_URL   = 'https://etcchain.com/gethProxy',
        USER_AGENT      = 'nomp/node-open-mining-portal';

    var address;

    // Constructor
    function Etcchain(Address){
        address = Address;
    }

    // If a site uses non-trusted SSL certificates, set this value to false
    Etcchain.STRICT_SSL = false;

    // Prototype
    Etcchain.prototype = {
        constructor: Etcchain,

        // Make an API request
        _request: function(options, callback){
            if (!('headers' in options)){
                options.headers = {};
            }

            options.headers['User-Agent'] = USER_AGENT;
            options.json = true;
            options.strictSSL = Etcchain.STRICT_SSL;

            request(options, function(err, response, body) {
                callback(err, body);
            });

            return this;
        },
        /////
        getBalance: function(callback){

            var parameters = {
                address : address
            };

            var options = {
                method: 'GET',
                url: PUBLIC_API_URL + '/getAddressBalance',
                qs: parameters
            };

            return this._request(options, function(err, body){
                var balance = parseInt(body.balance).toString(16);
                var ret = {error: err, data: JSON.stringify({result: "0x" + balance, msg : ""})};
                callback(ret);
            });
        },

        getTransaction: function(tx, callback){
            var parameters = {
                txHash : tx
            };

            var options = {
                method: 'GET',
                url: PROXY_API_URL + '/eth_getTransactionByHash',
                qs: parameters
            };

            return this._request(options, function(err, body){
                callback({error: err, response :body});
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

    return Etcchain;
}();