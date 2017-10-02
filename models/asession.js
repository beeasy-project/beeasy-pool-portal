"use strict";

module.exports = function(sequelize, DataTypes) {
    var Asession = sequelize.define("Asession", {
        id: {type: DataTypes.INTEGER(11).UNSIGNED, primaryKey: true, autoIncrement: true},
        admin_id: DataTypes.INTEGER(3),
        session: DataTypes.STRING(50)
    }, {
        tableName: 'asession',
        timestamps: false
    });

    return Asession;
};