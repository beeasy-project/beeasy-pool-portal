var request = require('request');
var nonce   = require('nonce');

module.exports = function (UserId,coinSymbol) {
    // Constants
    var version         = '0.1.0',
        USER_AGENT      = 'nomp/node-open-mining-portal';
    var userid,
        PUBLIC_API_URL,
        PRIVATE_API_URL;

    // Constructor
    function Nanopool(UserId,coinSymbol){
        userid = UserId;
        PUBLIC_API_URL = 'https://api.nanopool.org/v1/'+coinSymbol.toLowerCase();
        PRIVATE_API_URL = 'https://api.nanopool.org/v1/'+coinSymbol.toLowerCase();
    }

    // If a site uses non-trusted SSL certificates, set this value to false
    Nanopool.STRICT_SSL = true;

    // Prototype
    Nanopool.prototype = {
        //constructor: Nanopool,

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
        }

    };

    return new Nanopool(UserId,coinSymbol);
};