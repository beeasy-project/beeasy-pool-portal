"use strict";

module.exports = function(sequelize, DataTypes) {
    let AccrualsHist = sequelize.define("Accrualshist", {
        id: {type: DataTypes.INTEGER(11).UNSIGNED, primaryKey: true, autoIncrement: true},
        coin: {type: DataTypes.STRING(25)},
        value: {type: DataTypes.DECIMAL(18,12), allowNull: false, defaultValue:0},
        time: {type: DataTypes.BIGINT, allowNull: false, defaultValue:0}
    }, {
        tableName: 'accrualshist',
        timestamps: false
    });

    return AccrualsHist;
};