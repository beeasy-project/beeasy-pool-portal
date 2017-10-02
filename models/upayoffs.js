"use strict";

module.exports = function(sequelize, DataTypes) {
    var Payoff = sequelize.define("Upayoffs", {
        id: {type: DataTypes.INTEGER(11).UNSIGNED, primaryKey: true, autoIncrement: true},
        recipient: DataTypes.STRING(100),
        percent: DataTypes.DOUBLE,
        subject: DataTypes.STRING
    }, {
        tableName: 'upayoffs',
        timestamps: false
    });

    return Payoff;
};