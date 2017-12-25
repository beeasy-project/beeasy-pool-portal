let tools = require('./addtools.js');
let run = function (coin, client, clientname, _stat, redisClient, logger, process) {
    let statToAnalyse = _stat.Stat;
    let time = _stat.Time;
    redisClient.hget("summary:liveStat", client, function (err, result) {
        if (err) {
            logger.error(logSystem, logComponent, logSubCat, 'No data for monitoring or error occurred: ' + JSON.stringify(err));
            return;
        }
        let userstat = {};
        if (result)
            userstat = JSON.parse(result);
        else {
            userstat = {
                "Name": client.split(' [')[0],
                "IP": client.split(' [')[1].substr(0, client.split(' [')[1].length-1),
                "Time": time,
                "statTime": _stat.statTime
            }
        }

        //not analyse old data
        if (_stat.statTime < userstat.statTime) return;
        else {
            userstat.Time = time;
            userstat.statTime = _stat.statTime;
        }
        if (typeof userstat.description === 'undefined') userstat.description = '';
        userstat.status = _stat.status;
        userstat.upTime = _stat.upTime || Date.now();

        if (Date.now() - userstat.Time > 5 * 60 * 1000 && result && _stat.is_stoped !== 1) {
            process.send({
                type: "mineralert",
                client: clientname,
                message: "No heartbeat from " + client + ' for ' + Math.floor((Date.now() - userstat.Time) / 1000 / 60) + ' min.'
            });
        }
        if (Date.now() - userstat.Time > 10 * 60 * 1000 && result && _stat.status === 0) {
            process.send({type: "mineralert", client: clientname, message: client + ' will be disabled.'});
            //redisClient.hdel('summary:liveStat', client);
        }
        if (Object.keys(statToAnalyse).length !== 4) {
            userstat.Stat = {};
            userstat.curcoin = coin;
            redisClient.hset("summary:liveStat", client, JSON.stringify(userstat));
            return;
        }
        userstat.Stat = statToAnalyse;
        userstat.curcoin = coin;
        if (!userstat.avgStat) {
            userstat.avgStat = {
                count: 1,
                hashrate: parseFloat(userstat.Stat.hashrate),
                gpuhashrate: [],
                temperature: [],
                speed: []
            };
            for (index = 0; index < userstat.Stat.gpuhashrate.length; ++index) {
                userstat.avgStat.gpuhashrate.push(parseFloat(userstat.Stat.gpuhashrate[index]));
                userstat.avgStat.temperature.push(parseFloat(userstat.Stat.temperature[index]));
                userstat.avgStat.speed.push(parseFloat(userstat.Stat.speed[index]));
            }
        } else {
            let curcount = userstat.avgStat.count;
            userstat.avgStat.count = (curcount === 50 ? 50 : curcount + 1);
            userstat.avgStat.hashrate = (curcount === 50 ? (userstat.avgStat.hashrate * 49 + parseFloat(userstat.Stat.hashrate)) / 50 : (userstat.avgStat.hashrate * curcount + parseFloat(userstat.Stat.hashrate)) / (curcount + 1));
            for (index = 0; index < userstat.Stat.gpuhashrate.length; ++index) {
                let gpuhashrateToAnalyse = parseFloat(userstat.Stat.gpuhashrate[index] !== 'off' ? userstat.Stat.gpuhashrate[index] : '0');
                userstat.avgStat.gpuhashrate[index] = (curcount === 50 ? (userstat.avgStat.gpuhashrate[index] * 49 + gpuhashrateToAnalyse) / 50 : (userstat.avgStat.gpuhashrate[index] * curcount + gpuhashrateToAnalyse) / (curcount + 1));
                userstat.avgStat.temperature[index] = (curcount === 50 ? (userstat.avgStat.temperature[index] * 49 + parseFloat(userstat.Stat.temperature[index])) / 50 : (userstat.avgStat.temperature[index] * curcount + parseFloat(userstat.Stat.temperature[index])) / (curcount + 1));
                userstat.avgStat.speed[index] = (curcount === 50 ? (userstat.avgStat.speed[index] * 49 + parseFloat(userstat.Stat.speed[index])) / 50 : (userstat.avgStat.speed[index] * curcount + parseFloat(userstat.Stat.speed[index])) / (curcount + 1));
            }
        }

        //warnings
        userstat.warningtimes = userstat.warningtimes || {};
        if (userstat.Stat.temperature.filter(tools.isBigEnough(87)).length > 0) {
            userstat.warningtimes.warnT = userstat.warningtimes.warnT || Date.now();
        } else userstat.warningtimes.warnT = 0;
        if (userstat.Stat.speed.filter(tools.isSmallEnough(10)).length > 0 && _stat.is_stoped !== 1) userstat.warningtimes.warnS = userstat.warningtimes.warnS || Date.now();
        else userstat.warningtimes.warnS = 0;
        if (parseFloat(userstat.Stat.hashrate) * 1.1 < userstat.avgStat.hashrate && _stat.is_stoped !== 1) userstat.warningtimes.warnH = userstat.warningtimes.warnH || Date.now();
        else userstat.warningtimes.warnH = 0;
        if (userstat.warningtimes.warnT > 0 && Date.now() - userstat.warningtimes.warnT > 2 * 60 * 1000) {
            process.send({
                type: "mineralert",
                client: clientname,
                message: "Extremely high temperature on " + client + ' for ' + Math.floor((Date.now() - userstat.warningtimes.warnT) / 1000 / 60) + ' min.'
            });
            userstat.warningtimes.warnT = -1;
            userstat.status = 2;
        }
        if (userstat.warningtimes.warnS > 0 && Date.now() - userstat.warningtimes.warnS > 2 * 60 * 1000) {
            process.send({
                type: "mineralert",
                client: clientname,
                message: "Extremely low fan speed on " + client + ' for ' + Math.floor((Date.now() - userstat.warningtimes.warnS) / 1000 / 60) + ' min.'
            });
            userstat.warningtimes.warnS = -1;
            userstat.status = 2;
        }
        if (userstat.warningtimes.warnH > 0 && Date.now() - userstat.warningtimes.warnH > 2 * 60 * 1000) {
            process.send({
                type: "mineralert",
                client: clientname,
                message: "Hashrate extremely decreased on " + client + ' for ' + Math.floor((Date.now() - userstat.warningtimes.warnH) / 1000 / 60) + ' min.'
            });
            userstat.warningtimes.warnH = -1;
            userstat.status = 2;
        }
        //

        redisClient.hset("summary:liveStat", client, JSON.stringify(userstat));
    });
};
module.exports = {
    run: run
};