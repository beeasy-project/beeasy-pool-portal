"use strict";

module.exports = function(sequelize, DataTypes) {
    var Historyfarm = sequelize.define("Historyfarm", {
        id: {type: DataTypes.INTEGER(11).UNSIGNED, primaryKey: true, autoIncrement: true},
        name: {type: DataTypes.STRING, unique: 'uniqueIndex'},
        ip: {type: DataTypes.STRING(100), unique: 'uniqueIndex'},
        coin: {type: DataTypes.STRING(100), unique: 'uniqueIndex'}
    }, {
        tableName: 'historyfarm',
        timestamps: false
    });
    Historyfarm.associate = function(models) {
        Historyfarm.hasMany(models.Historystat, {foreignKey: 'farm_id', as: 'Stat', foreignKeyConstraint: true, onDelete: 'cascade'});
    };

    return Historyfarm;
};