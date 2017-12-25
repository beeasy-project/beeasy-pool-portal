"use strict";

module.exports = function(sequelize, DataTypes) {
    var Payout = sequelize.define("Payouts", {
        id: {type: DataTypes.INTEGER(11).UNSIGNED, primaryKey: true, autoIncrement: true},
        name: {type: DataTypes.STRING(100), unique: 'uniqueIndex'},
        value: {type: DataTypes.DECIMAL(18,12), allowNull: false, defaultValue:0},
        coin: {type: DataTypes.STRING(25), unique: 'uniqueIndex'},
        status: {type: DataTypes.INTEGER(3).UNSIGNED, unique: 'uniqueIndex'},
        tx: {type: DataTypes.STRING(100), allowNull: false, defaultValue:''},
        sendedAt: {type: DataTypes.BIGINT, allowNull: false, defaultValue:0, unique: 'uniqueIndex'}
    }, {
        tableName: 'payouts',
        timestamps: false,
        version: true
    });

    return Payout;
};