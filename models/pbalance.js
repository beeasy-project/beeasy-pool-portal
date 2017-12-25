"use strict";

module.exports = function(sequelize, DataTypes) {
    var Balance = sequelize.define("Pbalance", {
        id: {type: DataTypes.INTEGER(11).UNSIGNED, primaryKey: true, autoIncrement: true},
        coin: {type: DataTypes.STRING(25), unique: true},
        value: {type: DataTypes.DECIMAL(24,18), allowNull: false, defaultValue:0},
        basevalue: {type: DataTypes.DECIMAL(24,18), allowNull: false, defaultValue:0}
    }, {
        tableName: 'pbalance',
        timestamps: false
    });

    return Balance;
};