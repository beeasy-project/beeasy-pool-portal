"use strict";

module.exports = function(sequelize, DataTypes) {
    var Wallets = sequelize.define("Uwallets", {
        id: {type: DataTypes.INTEGER(11).UNSIGNED, primaryKey: true, autoIncrement: true},
        name: DataTypes.STRING(50),
        value: DataTypes.STRING(100)
    }, {
        tableName: 'uwallets',
        timestamps: false
    });

    return Wallets;
};