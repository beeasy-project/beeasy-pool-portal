"use strict";

module.exports = function(sequelize, DataTypes) {
    var Admin = sequelize.define("Admin", {
        id: {type: DataTypes.INTEGER(3).UNSIGNED, primaryKey: true, autoIncrement: true},
        name: DataTypes.STRING(50),
        password: DataTypes.STRING(100),
        telegram: DataTypes.STRING(20)
    }, {
        tableName: 'admin',
        timestamps: false
    });

    return Admin;
};