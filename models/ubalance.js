"use strict";

module.exports = function(sequelize, DataTypes) {
    var Balance = sequelize.define("Ubalance", {
        id: {type: DataTypes.INTEGER(11).UNSIGNED, primaryKey: true, autoIncrement: true},
        name: DataTypes.STRING(100),
        value: {type: DataTypes.DECIMAL(18,12), allowNull: false, defaultValue:0},
        coin: DataTypes.STRING(25)
    }, {
        tableName: 'ubalance',
        timestamps: false
    });

    return Balance;
};