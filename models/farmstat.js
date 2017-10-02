"use strict";

module.exports = function(sequelize, DataTypes) {
    var Farmstat = sequelize.define("Farmstat", {
        id: {type: DataTypes.INTEGER(11).UNSIGNED, primaryKey: true, autoIncrement: true},
        count: {type: DataTypes.INTEGER(3).UNSIGNED, allowNull: false, defaultValue:0},
        hashrate: DataTypes.DOUBLE,
        gpuhashrate: DataTypes.STRING,
        temperature: DataTypes.STRING,
        speed: DataTypes.STRING
    }, {
        tableName: 'farmstat',
        timestamps: false
    });

    return Farmstat;
};