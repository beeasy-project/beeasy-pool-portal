const fs = require('fs');

module.exports = function(logger, portalConfig, poolConfigs){
    var payouts;

    if (portalConfig.mysql.enabled === true)
        payouts = require('./payoutsSql.js');
    else
        payouts = require('./payoutsRedis.js');

    return new payouts(logger, portalConfig, poolConfigs);
};