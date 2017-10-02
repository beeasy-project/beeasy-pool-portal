"use strict";

module.exports = function(sequelize, DataTypes) {
    var Usession = sequelize.define("Usession", {
        id: {type: DataTypes.INTEGER(11).UNSIGNED, primaryKey: true, autoIncrement: true},
        user_id: DataTypes.INTEGER(11),
        session: DataTypes.STRING(50)
    }, {
        tableName: 'usession',
        timestamps: false
    });

    return Usession;
};