JSON.minify = JSON.minify || require("node-json-minify");
var fs          = require('fs')
    , path      = require('path')
    , Sequelize = require('sequelize')
    , lodash    = require('lodash')
    , portalConfig = JSON.parse(JSON.minify(fs.readFileSync("config.json", {encoding: 'utf8'})))
    , sequelize = new Sequelize(portalConfig.mysql.db, portalConfig.mysql.user, portalConfig.mysql.pass, {
        host: portalConfig.mysql.host,
        dialect: 'mysql',
        pool: {
            max: 100,
            min: 0,
            idle: 10000,
            acquire: 10000
        },
        logging: portalConfig.logLevel === 'debug' ? console.log : false
    })
    , db        = {};

fs.readdirSync(__dirname)
    .filter(function(file) {
        return (file.indexOf('.') !== 0) && (file !== 'index.js')
    })
    .forEach(function(file) {
        var model = sequelize.import(path.join(__dirname, file));
        db[model.name] = model
    });

Object.keys(db).forEach(function(modelName) {
    if ("associate" in db[modelName]) {
        db[modelName].associate(db);
    }
});

sequelize.sync();

module.exports = lodash.extend({
    sequelize: sequelize,
    Sequelize: Sequelize
}, db);