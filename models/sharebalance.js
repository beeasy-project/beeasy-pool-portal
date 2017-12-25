"use strict";

module.exports = function(sequelize, DataTypes) {
    var Balance = sequelize.define("Sharebalance", {
        id: {type: DataTypes.INTEGER(11).UNSIGNED, primaryKey: true, autoIncrement: true},
        coin: {type: DataTypes.STRING(25)},
        sym: {type: DataTypes.STRING(10)},
        value: {type: DataTypes.DECIMAL(24,18), allowNull: false, defaultValue:0},
        shares: {type: DataTypes.DECIMAL(15,5), allowNull: false, defaultValue:0},
        prevshares: {type: DataTypes.DECIMAL(15,5), allowNull: false, defaultValue:0},
        percents: {type: DataTypes.DECIMAL(8,5), allowNull: false, defaultValue:0}
    }, {
        tableName: 'sharebalance',
        timestamps: false
    });

    return Balance;
};