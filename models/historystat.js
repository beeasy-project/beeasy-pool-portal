"use strict";

module.exports = function(sequelize, DataTypes) {
    var Historystat = sequelize.define("Historystat", {
        id: {type: DataTypes.INTEGER(11).UNSIGNED, primaryKey: true, autoIncrement: true},
        hashrate: DataTypes.DOUBLE,
        gpuhashrate: DataTypes.STRING,
        temperature: DataTypes.STRING,
        speed: DataTypes.STRING,
        time: {type: DataTypes.BIGINT, allowNull: false, defaultValue:0}
    }, {
        tableName: 'historystat',
        timestamps: false
    });

    return Historystat;
};