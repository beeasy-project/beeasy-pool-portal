"use strict";

module.exports = function (sequelize, DataTypes) {
    let NetStats = sequelize.define("NetStats", {
        id: {type: DataTypes.INTEGER(11).UNSIGNED, primaryKey: true, autoIncrement: true},
        coin: {type: DataTypes.STRING(25)},
        blockTime: {type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 0},
        netHashrate: {type: DataTypes.DECIMAL(40, 4), allowNull: false, defaultValue: 0},
        time: {type: DataTypes.BIGINT, allowNull: false, defaultValue: 0}
    }, {
        tableName: 'netstats',
        timestamps: false
    });

    return NetStats;
};