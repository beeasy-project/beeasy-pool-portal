"use strict";

module.exports = function(sequelize, DataTypes) {
    var Transaction = sequelize.define("Transactions", {
        id: {type: DataTypes.INTEGER(11).UNSIGNED, primaryKey: true, autoIncrement: true},
        address: DataTypes.STRING(100),
        total_amount: {
            type: DataTypes.DECIMAL(18,12),
            get() {
                return parseFloat(this.getDataValue('total_amount'));
            }
        },
        amount: {
            type: DataTypes.DECIMAL(18,12),
            get() {
                return parseFloat(this.getDataValue('amount'));
            }
        },
        amount_affiliate: {
            type: DataTypes.DECIMAL(18,12),
            get() {
                return parseFloat(this.getDataValue('amount_affiliate'));
            }
        },
        payoffs: {
            type: DataTypes.TEXT,
            get() {
                return JSON.parse(this.getDataValue('payoffs'));
            },
            set(val) {
                this.setDataValue('payoffs', JSON.stringify(val));
            }
        }
    }, {
        tableName: 'transactions',
        timestamps: false
    });

    return Transaction;
};