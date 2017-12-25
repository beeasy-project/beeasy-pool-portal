"use strict";

const ethUsd = require('./scripts/collectRates').getEthUsdRates;
const usdRub = require('./scripts/collectRates').getUsdRubRates;
const miningEstimation = require('./scripts/miningEstimation').estimateMiningProfit;


ethUsd((result) => {
    console.log(result);
    usdRub(result, () => {
        console.log(result);
        miningEstimation(() => {
            console.log(result);
            process.exit(0);
        });
    })
});



