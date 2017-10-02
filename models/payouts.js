"use strict";

module.exports = function(sequelize, DataTypes) {
    var Payout = sequelize.define("Payouts", {
        id: {type: DataTypes.INTEGER(11).UNSIGNED, primaryKey: true, autoIncrement: true},
        name: DataTypes.STRING(100),
        value: {type: DataTypes.DECIMAL(18,12), allowNull: false, defaultValue:0},
        coin: DataTypes.STRING(25),
        status: DataTypes.INTEGER(3).UNSIGNED,
        tx: {type: DataTypes.STRING(100), allowNull: false, defaultValue:''},
        sendedAt: {type: DataTypes.BIGINT, allowNull: false, defaultValue:0}
    }, {
        tableName: 'payouts',
        timestamps: false
    });

    return Payout;
};