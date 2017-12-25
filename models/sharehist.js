"use strict";

module.exports = function(sequelize, DataTypes) {
    let BalanceHist = sequelize.define("Sharehist", {
        id: {type: DataTypes.INTEGER(11).UNSIGNED, primaryKey: true, autoIncrement: true},
        coin: {type: DataTypes.STRING(25)},
        shares: {type: DataTypes.DECIMAL(15,5), allowNull: false, defaultValue:0},
        time: {type: DataTypes.BIGINT, allowNull: false, defaultValue:0}
    }, {
        tableName: 'sharehist',
        timestamps: false
    });

    return BalanceHist;
};