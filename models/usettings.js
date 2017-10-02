"use strict";

module.exports = function(sequelize, DataTypes) {
    var Settings = sequelize.define("Usettings", {
        id: {type: DataTypes.INTEGER(11).UNSIGNED, primaryKey: true, autoIncrement: true},
        name: DataTypes.STRING(50),
        value: DataTypes.STRING(100)
    }, {
        tableName: 'usettings',
        timestamps: false
    });

    return Settings;
};