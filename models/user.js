"use strict";

module.exports = function(sequelize, DataTypes) {
    var User = sequelize.define("User", {
        id: {type: DataTypes.INTEGER(11).UNSIGNED, primaryKey: true, autoIncrement: true},
        name: {type: DataTypes.STRING(100), unique: true},
        password: DataTypes.STRING(100),
        telegram: {type: DataTypes.STRING(20), allowNull: false, defaultValue:''},
        referralcode: {type: DataTypes.STRING(100), allowNull: false, unique: true},
        lConfirmationSendTime: {type: DataTypes.BIGINT, allowNull: false, defaultValue:0},
        wConfirmationSendTime: {type: DataTypes.BIGINT, allowNull: false, defaultValue:0},
        sConfirmationSendTime: {type: DataTypes.BIGINT, allowNull: false, defaultValue:0}
    }, {
        tableName: 'user',
        timestamps: false
    });
    User.associate = function(models) {
        User.hasMany(models.Usettings, {foreignKey: 'user_id',as: 'Settings'});
        User.hasMany(models.Uwallets, {foreignKey: 'user_id',as: 'Wallets'});
        User.hasMany(models.Umessages, {foreignKey: 'user_id',as: 'Messages'});
        User.hasMany(models.Payments, {foreignKey: 'user', sourceKey: 'name', as: 'Payments'});
        User.hasMany(models.Upayoffs, {foreignKey: 'user_id',as: 'Payoffs'});
    };

    return User;
};