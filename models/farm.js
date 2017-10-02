"use strict";

module.exports = function(sequelize, DataTypes) {
    var Farm = sequelize.define("Farm", {
        id: {type: DataTypes.INTEGER(11).UNSIGNED, primaryKey: true, autoIncrement: true},
        name: {type: DataTypes.STRING, unique: 'uniqueIndex'},
        ip: {type: DataTypes.STRING(100), unique: 'uniqueIndex'},
        time: {type: DataTypes.BIGINT, allowNull: false, defaultValue:0},
        curcoin: {type: DataTypes.STRING(100)},
        warnT: {type: DataTypes.BIGINT, allowNull: false, defaultValue:0},
        warnS: {type: DataTypes.BIGINT, allowNull: false, defaultValue:0},
        warnH: {type: DataTypes.BIGINT, allowNull: false, defaultValue:0}
    }, {
        tableName: 'farm',
        timestamps: false
    });
    Farm.associate = function(models) {
        Farm.hasOne(models.Farmstat, {foreignKey: 'stat_id', as: 'Stat'});
        Farm.hasOne(models.Farmstat, {foreignKey: 'avgstat_id', as: 'Avgstat'});
        Farm.hasMany(models.Umessages, {foreignKey: 'farm', sourceKey: 'name', as: 'Messages'});
    };

    return Farm;
};