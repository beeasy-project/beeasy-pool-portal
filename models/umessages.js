"use strict";

module.exports = function(sequelize, DataTypes) {
    var Messages = sequelize.define("Umessages", {
        id: {type: DataTypes.INTEGER(11).UNSIGNED, primaryKey: true, autoIncrement: true},
        cmd: DataTypes.STRING(50),
        params: DataTypes.STRING(100),
        createdAt: {type: DataTypes.BIGINT, allowNull: false, defaultValue:0},
        sendedAt: {type: DataTypes.BIGINT, allowNull: false, defaultValue:0}
    }, {
        tableName: 'umessage',
        timestamps: false
    });

    return Messages;
};