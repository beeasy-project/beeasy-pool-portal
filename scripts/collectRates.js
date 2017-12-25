"use strict";

const request = require('request');
const models = require('../models');

function getEthUsdRates(callback) {
    request('https://api.etherscan.io/api?module=stats&action=ethprice', {json: true}, (err, res, body) => {
        if (err) {
            return console.log(err);
        }
        let ethUsd = body.result.ethusd;
        models.Rates.create({coin: 'ethereum', code: 'USD', value: ethUsd, time: Date.now()}).then(created => {
            return callback({result: ethUsd, error: null});
        }).catch(error => {
            return callback({result: null, error: error});
        });
    });
}

function getUsdRubRates(usdPrice, callback) {
    request('https://api.fixer.io/latest?base=USD&symbols=RUB', {json: true}, (err, res, body) => {
        if (err) {
            return console.log(err);
        }
        let usdRub = body.rates.RUB;
        models.Rates.create({
            coin: 'ethereum',
            code: 'RUB',
            value: (usdPrice.result * usdRub),
            time: Date.now()
        }).then(created => {
            return callback({result: true, error: null});
        }).catch(error => {
            return callback({result: null, error: error});
        });
    });
}

module.exports = {
    getUsdRubRates,
    getEthUsdRates
};