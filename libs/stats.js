const fs = require('fs');

module.exports = function(logger, portalConfig, poolConfigs){
    var stats;

    if (portalConfig.mysql.enabled === true)
        stats = require('./statsSql.js');
    else
        stats = require('./statsRedis.js');

    return new stats(logger, portalConfig, poolConfigs);
};