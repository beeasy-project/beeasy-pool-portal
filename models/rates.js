"use strict";

module.exports = function (sequelize, DataTypes) {
    let Rates = sequelize.define("Rates", {
        id: {type: DataTypes.INTEGER(11).UNSIGNED, primaryKey: true, autoIncrement: true},
        coin: {type: DataTypes.STRING(25)},
        code: {type: DataTypes.STRING(5)},
        value: {type: DataTypes.DECIMAL(18, 12), allowNull: false, defaultValue: 0},
        time: {type: DataTypes.BIGINT, allowNull: false, defaultValue: 0}
    }, {
        tableName: 'rates',
        timestamps: false
    });

    return Rates;
};