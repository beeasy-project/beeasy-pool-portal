var request = require('request');
var nonce   = require('nonce');

module.exports = function() {
    'use strict';

    // Module dependencies

    // Constants
    var version         = '0.1.0',
        PUBLIC_API_URL  = 'https://api.nanopool.org/v1/eth',
        PRIVATE_API_URL = 'https://api.nanopool.org/v1/eth',
        USER_AGENT      = 'nomp/node-open-mining-portal'
    var userid;

    // Constructor
    function Nanopool(UserId){
        userid = UserId;
    }

    // If a site uses non-trusted SSL certificates, set this value to false
    Nanopool.STRICT_SSL = true;

    // Helper methods
    function joinCurrencies(currencyA, currencyB){
        return currencyA + '-' + currencyB;
    }

    // Prototype
    Nanopool.prototype = {
        constructor: Nanopool,

        // Make an API request
        _request: function(options, callback){
            if (!('headers' in options)){
                options.headers = {};
            }

            options.headers['User-Agent'] = USER_AGENT;
            options.json = true;
            options.strictSSL = Nanopool.STRICT_SSL;

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
            var options = {
                url: PUBLIC_API_URL + '/balance/' + userid,
                qs: null
            };

            return this._request(options, callback);
        },

        getPayments: function(callback){
            var options = {
                url: PUBLIC_API_URL + '/payments/' + userid,
                qs: null
            };

            return this._request(options, callback);
        },




        // PUBLIC METHODS

        getTicker: function(callback){
            var options = {
                method: 'GET',
                url: PUBLIC_API_URL + '/getmarketsummaries',
                qs: null
            };

            return this._request(options, callback);
        },

        // getBuyOrderBook: function(currencyA, currencyB, callback){
        //     var options = {
        //         method: 'GET',
        //         url: PUBLIC_API_URL + '/orders/' + currencyB + '/' + currencyA + '/BUY',
        //         qs: null
        //     };

        //     return this._request(options, callback);
        // },

        getOrderBook: function(currencyA, currencyB, callback){
            var parameters = {
                market: joinCurrencies(currencyA, currencyB),
                type: 'buy',
                depth: '50'
            }
            var options = {
                method: 'GET',
                url: PUBLIC_API_URL + '/getorderbook',
                qs: parameters
            }

            return this._request(options, callback);
        },

        getTradeHistory: function(currencyA, currencyB, callback){
            var parameters = {
                command: 'returnTradeHistory',
                currencyPair: joinCurrencies(currencyA, currencyB)
            };

            return this._public(parameters, callback);
        },


        /////


        // PRIVATE METHODS

        myBalances: function(callback){
            var parameters = {
                command: 'returnBalances'
            };

            return this._private(parameters, callback);
        },

        myOpenOrders: function(currencyA, currencyB, callback){
            var parameters = {
                command: 'returnOpenOrders',
                currencyPair: joinCurrencies(currencyA, currencyB)
            };

            return this._private(parameters, callback);
        },

        myTradeHistory: function(currencyA, currencyB, callback){
            var parameters = {
                command: 'returnTradeHistory',
                currencyPair: joinCurrencies(currencyA, currencyB)
            };

            return this._private(parameters, callback);
        },

        buy: function(currencyA, currencyB, rate, amount, callback){
            var parameters = {
                command: 'buy',
                currencyPair: joinCurrencies(currencyA, currencyB),
                rate: rate,
                amount: amount
            };

            return this._private(parameters, callback);
        },

        sell: function(currencyA, currencyB, rate, amount, callback){
            var parameters = {
                command: 'sell',
                currencyPair: joinCurrencies(currencyA, currencyB),
                rate: rate,
                amount: amount
            };

            return this._private(parameters, callback);
        },

        cancelOrder: function(currencyA, currencyB, orderNumber, callback){
            var parameters = {
                command: 'cancelOrder',
                currencyPair: joinCurrencies(currencyA, currencyB),
                orderNumber: orderNumber
            };

            return this._private(parameters, callback);
        },

        withdraw: function(currency, amount, address, callback){
            var parameters = {
                command: 'withdraw',
                currency: currency,
                amount: amount,
                address: address
            };

            return this._private(parameters, callback);
        }
    };

    return Nanopool;
}();