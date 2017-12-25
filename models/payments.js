"use strict";

module.exports = function(sequelize, DataTypes) {
    var Payment = sequelize.define("Payments", {
        id: {type: DataTypes.INTEGER(11).UNSIGNED, primaryKey: true, autoIncrement: true},
        coin: DataTypes.STRING(25),
        tx: {type: DataTypes.STRING(100), allowNull: false, defaultValue:''},
        to: DataTypes.STRING(100),
        amount: DataTypes.DECIMAL(18,12),
        time: {
            type: DataTypes.BIGINT,
            allowNull: false,
            defaultValue: 0,
            get() {
                return this.getDataValue('time') / 1000;
            }
        },
        is_notice: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue:0}
    }, {
        tableName: 'payments',
        timestamps: false
    });
    Payment.associate = function(models) {
        Payment.hasOne(models.Transactions, {foreignKey: 'payment_id', as: 'transaction', foreignKeyConstraint: true, onDelete: 'cascade'});
    };

    return Payment;
};