"use strict";

module.exports = function(sequelize, DataTypes) {
    var Codes = sequelize.define("Confcode", {
        id: {type: DataTypes.INTEGER(11).UNSIGNED, primaryKey: true, autoIncrement: true},
        user_id: {
            type: DataTypes.INTEGER(11).UNSIGNED,
            references: {
                model: "user",
                key: "id"
            }
        },
        code: DataTypes.STRING(10),
        is_send: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue:0},
        time: {type: DataTypes.BIGINT, allowNull: false, defaultValue:0}
    }, {
        tableName: 'confcode',
        timestamps: false
    });

    return Codes;
};