const fs = require('fs');

module.exports = function() {
    JSON.minify = JSON.minify || require("node-json-minify");
    var portalConfig = JSON.parse(JSON.minify(fs.readFileSync("config.json", {encoding: 'utf8'})));

    var service;

    if (portalConfig.mysql.enabled === true)
        service = require('./admServiceSql.js');
    else
        service = require('./admServiceRedis.js');

    return service;
}();