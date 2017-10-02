var tools = require('./addtools.js');
var models  = require('../models');

var run = function (coin, client, clientname, statToAnalyse, time, redisClient, logger, process) {
    models.Farm.findOrCreate({where: {name: client.split(' [')[0], ip: client.split(' [')[1].substr(0, client.split(' [')[1].length-1)}}).spread((farm, created) => {
        if (created) farm.time = time;
        if (time < farm.time) return;
        else farm.time = time;

        if (Date.now() - farm.time > 2 * 60 * 1000 && !created && tools.parseName(farm.name)[1].length>0) {
            process.send({
                type: "mineralert",
                client: clientname,
                message: "No heartbeat from " + client + ' for ' + Math.floor((Date.now() - farm.time) / 1000 / 60) + ' min.'
            });
        }
        if (Date.now() - farm.time > 10 * 60 * 1000 && !created) {
            process.send({type: "mineralert", client: clientname, message: client + ' will be disabled.'});
            farm.destroy();
            return;
        }
        if (Object.keys(statToAnalyse).length !== 4) {
            models.Farmstat.findOrCreate({where: {stat_id: farm.id}}).spread((stat, statcreated) => {
                stat.destroy();
            })
            farm.curcoin = coin;
            farm.save();
            return;
        }
        models.Farmstat.findOrCreate({where: {stat_id: farm.id}}).spread((stat, statcreated) => {
            stat.hashrate = parseFloat(statToAnalyse.hashrate);
            stat.gpuhashrate = statToAnalyse.gpuhashrate.join(',');
            stat.temperature = statToAnalyse.temperature.join(',');
            stat.speed = statToAnalyse.speed.join(',');
            stat.save();
        })
        models.Farmstat.findOrCreate({where: {avgstat_id: farm.id}}).spread((avgstat, avgstatcreated) => {
            if (avgstatcreated) {
                avgstat.count = 1;
                avgstat.hashrate = parseFloat(statToAnalyse.hashrate);
                avgstat.gpuhashrate = statToAnalyse.gpuhashrate.join(',');
                avgstat.temperature = statToAnalyse.temperature.join(',');
                avgstat.speed = statToAnalyse.speed.join(',');
            } else {
                var curcount = avgstat.count;
                avgstat.count = (curcount === 50 ? 50 : curcount + 1);
                avgstat.hashrate = (curcount === 50 ? (avgstat.hashrate * 49 + parseFloat(statToAnalyse.hashrate)) / 50 : (avgstat.hashrate * curcount + parseFloat(statToAnalyse.hashrate)) / (curcount + 1));
                var gpuhashrateArr = avgstat.gpuhashrate.split(',');
                var temperatureArr = avgstat.temperature.split(',');
                var speedArr = avgstat.speed.split(',');
                for (index = 0; index < statToAnalyse.gpuhashrate.length; ++index) {
                    var gpuhashrateToAnalyse = parseFloat(statToAnalyse.gpuhashrate[index] !== 'off' ? statToAnalyse.gpuhashrate[index] : '0');
                    gpuhashrateArr[index] = (curcount === 50 ? (gpuhashrateArr[index] * 49 + gpuhashrateToAnalyse) / 50 : (gpuhashrateArr[index] * curcount + gpuhashrateToAnalyse) / (curcount + 1));
                    temperatureArr[index] = (curcount === 50 ? (temperatureArr[index] * 49 + parseFloat(statToAnalyse.temperature[index])) / 50 : (temperatureArr[index] * curcount + parseFloat(statToAnalyse.temperature[index])) / (curcount + 1));
                    speedArr[index] = (curcount === 50 ? (speedArr[index] * 49 + parseFloat(statToAnalyse.speed[index])) / 50 : (speedArr[index] * curcount + parseFloat(statToAnalyse.speed[index])) / (curcount + 1));
                }
                avgstat.gpuhashrate = gpuhashrateArr.join(',');
                avgstat.temperature = temperatureArr.join(',');
                avgstat.speed = speedArr.join(',');
            }
            avgstat.save();
            farm.curcoin = coin;

            //warnings
            if (statToAnalyse.temperature.filter(tools.isBigEnough(87)).length > 0) {
                farm.warnT = farm.warnT || Date.now();
            } else farm.warnT = 0;
            if (statToAnalyse.speed.filter(tools.isSmallEnough(30)).length > 0) farm.warnS = farm.warnS || Date.now();
            else farm.warnS = 0;
            if (parseFloat(statToAnalyse.hashrate) * 1.1 < avgstat.hashrate) farm.warnH = farm.warnH || Date.now();
            else farm.warnH = 0;
            if (farm.warnT > 0 && Date.now() - farm.warnT > 2 * 60 * 1000) {
                process.send({
                    type: "mineralert",
                    client: clientname,
                    message: "Extremely high temperature on " + client + ' for ' + Math.floor((Date.now() - farm.warnT) / 1000 / 60) + ' min.'
                });
                farm.warnT = -1;
            }
            if (farm.warnS > 0 && Date.now() - farm.warnS > 2 * 60 * 1000) {
                process.send({
                    type: "mineralert",
                    client: clientname,
                    message: "Extremely low fan speed on " + client + ' for ' + Math.floor((Date.now() - farm.warnS) / 1000 / 60) + ' min.'
                });
                farm.warnS = -1;
            }
            if (farm.warnH > 0 && Date.now() - farm.warnH > 2 * 60 * 1000) {
                process.send({
                    type: "mineralert",
                    client: clientname,
                    message: "Hashrate extremely decreased on " + client + ' for ' + Math.floor((Date.now() - farm.warnH) / 1000 / 60) + ' min.'
                });
                farm.warnH = -1;
            }
            //
            farm.save()
        })

        //models.Farm.findOne({where: {name: client.split(' [')[0], ip: client.split(' [')[1].substr(0, client.split(' [')[1].length-1)}, include: [ 'Stat', 'Avgstat' ]})
    })
};
module.exports = {
    run: run
};