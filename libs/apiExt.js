const nanopoolApi = require('./apiNanopool.js');
const apiEtherscan = require('./apiEtherscan.js');
const apiEtcchain = require('./apiEtcchain.js');

function ApiExt(poolConfigs) {
    let poolapiList = {};
    let paymentApiList = {};

    this.getBalance = function(coin,callback){
        let extApi = poolapiList[coin];
        switch(coin){
            case 'ethereum':
            case 'ethereum classic':
                return extApi.getBalance(callback);
            default:
                return callback("Data error",null);
        }
    };

    this.getPayments = function(coin,callback){
        let extApi = poolapiList[coin];
        switch(coin){
            case 'ethereum':
            case 'ethereum classic':
                return extApi.getPayments(callback);
            default:
                return callback("Data error",null);
        }
    };

    this.getPaymentBalance = function(coin,callback){
        let extApi = paymentApiList[coin];
        switch(coin){
            case 'ethereum':
            case 'ethereum classic':
                return extApi.getBalance(callback);
            default:
                return callback("Data error",null);
        }
    };

    this.getPaymentTransaction = function(coin, tx, callback){
        let extApi = paymentApiList[coin];
        switch(coin){
            case 'ethereum':
            case 'ethereum classic':
                return extApi.getTransaction(tx, callback);
            default:
                return callback("Data error",null);
        }
    };

    this.getPaymentAccounts = function(coin,callback){
        let extApi = paymentApiList[coin];
        switch(coin){
            case 'ethereum':
            case 'ethereum classic':
                return extApi.getAccounts(callback);
            default:
                return callback("Data error",null);
        }
    };

    this.paymentCmd = function(coin, command, args, callback){
        let extApi = paymentApiList[coin];
        switch(coin){
            case 'ethereum':
            case 'ethereum classic':
                return extApi.cmd(command, args, callback);
            default:
                return callback("Data error",null);
        }
    };

    this.paymentBatchCmd = function(coin, commands, callback){
        let extApi = paymentApiList[coin];
        switch(coin){
            case 'ethereum':
            case 'ethereum classic':
                return extApi.batchCmd(commands, callback);
            default:
                return callback("Data error",null);
        }
    };

    function addPoolApi (coin, user, sym){
        poolapiList[coin] = new nanopoolApi(user, sym);
    }

    function addPaymentApi (coin, params){
        switch(coin){
            case 'ethereum':
                paymentApiList[coin] = new apiEtherscan(params.daemon.etherscan, params.daemon.user);
                break;
            case 'ethereum classic':
                paymentApiList[coin] = new apiEtcchain(params.daemon.user);
                break;
        }
    }

    function init(poolConfigs){
        Object.keys(poolConfigs).forEach(function(coin){
            addPoolApi(coin,poolConfigs[coin].daemons[0].user,poolConfigs[coin].coin.symbol);
            addPaymentApi(coin,poolConfigs[coin].paymentProcessing);
        });
    }

    ApiExt.prototype = {
        constructor: init(poolConfigs)
    };

    return this;
}

module.exports = ApiExt;