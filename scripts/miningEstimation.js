"use strict";

const request = require('request');
const models = require('../models');


function estimateMiningProfit(callback) {
    request('https://etherchain.org/api/miningEstimator', {json: true}, (err, res, body) => {
            if (err) {
                return console.log(err);
            }
            models.NetStats.create({
                coin: 'ethereum',
                blockTime: body.data[0].blockTime,
                netHashrate: body.data[0].hashRate,
                time: Date.now()
            }).then(created => {
                return callback({result: true, error: null});
            }).catch(error => {
                return callback({result: null, error: error});
            });
        }
    )
    ;
}

module.exports = {
    estimateMiningProfit
};