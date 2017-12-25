"use strict";

module.exports = function(sequelize, DataTypes) {
    var Balance = sequelize.define("Ubalance", {
        id: {type: DataTypes.INTEGER(11).UNSIGNED, primaryKey: true, autoIncrement: true},
        name: {type: DataTypes.STRING(100), unique: 'uniqueIndex'},
        value: {type: DataTypes.DECIMAL(18,12), allowNull: false, defaultValue:0},
        coin: {type: DataTypes.STRING(25), unique: 'uniqueIndex'}
    }, {
        tableName: 'ubalance',
        timestamps: false
    });

    return Balance;
};