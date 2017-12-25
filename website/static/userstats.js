var hashrate=[];
var connections=[];
var gpuhashrate=[];
var gputemperature=[];
var gpufan=[];
var poolHashrateData=[];
var gpuHashrateData=[];
var gpuTemperatureData=[];
var gpuFanData=[];

var poolHashrateChart;
var gpuHashrateChart;
var gpuTemperatureChart;
var gpuFanChart;

function GetConnectionStat( hash ){
    apiRequest('liveconnect', {connectionhash : hash }, function(response){
        connections = [];

        hashrate=[];
        gpuhashrate=[];
        gputemperature=[];
        gpufan=[];

        poolHashrateData = [];
        gpuHashrateData=[];
        gpuTemperatureData=[];
        gpuFanData=[];



        for( var r in response)
        {
            var curr = JSON.parse(response[r]);
            if( curr.Stat != undefined && curr.Stat.hashrate != undefined)
                connections.push([curr.Time, curr.Stat.hashrate*1000]);


            if( curr.Stat != undefined && curr.Stat.gpuhashrate != undefined) {
                if( gpuhashrate.length == 0 )
                {
                    for (var i = 0; i < curr.Stat.gpuhashrate.length; i++)
                        gpuhashrate.push(new Array());
                }
                for (var i = 0; i < curr.Stat.gpuhashrate.length; i++) {
                    gpuhashrate[i].push([curr.Time, curr.Stat.gpuhashrate[i]]);
                }
            }
            if( curr.Stat != undefined && curr.Stat.temperature != undefined) {
                if( gputemperature.length == 0 )
                {
                    for (var i = 0; i < curr.Stat.temperature.length; i++)
                        gputemperature.push(new Array());
                }
                for (var i = 0; i < curr.Stat.temperature.length; i++) {
                    gputemperature[i].push([curr.Time, curr.Stat.temperature[i]]);
                }
            }
            if( curr.Stat != undefined && curr.Stat.speed != undefined) {
                if( gpufan.length == 0 )
                {
                    for (var i = 0; i < curr.Stat.speed.length; i++)
                        gpufan.push(new Array());
                }
                for (var i = 0; i < curr.Stat.speed.length; i++) {
                    gpufan[i].push([curr.Time, curr.Stat.speed[i]]);
                }
            }
        }

        poolHashrateData.push({key : hash, values : connections});

        for( var a = 0; a< gpuhashrate.length; a++ )
        {
            gpuHashrateData.push( {key : "GPU"+a, values : gpuhashrate[a]});
        }

        for( var a = 0; a< gputemperature.length; a++ )
        {
            gpuTemperatureData.push( {key : "GPU"+a, values : gputemperature[a]});
        }

        for( var a = 0; a< gpufan.length; a++ )
        {
            gpuFanData.push( {key : "GPU"+a, values : gpufan[a]});
        }

        TriggerChartUpdates();
    });
}

function TriggerChartUpdates(){
    if (typeof poolHashrateChart === 'undefined') return setTimeout(TriggerChartUpdates, 100);
    if( typeof poolHashrateData === 'undefined' || poolHashrateData.length === 0) {
        $('#poolHashrateCnt').hide();
    }else {
        $('#poolHashrateCnt').show();
        d3.select('#userHashrate').datum(poolHashrateData).call(poolHashrateChart);
        poolHashrateChart.update();
    }

    if(typeof gpuHashrateData == 'undefined' || gpuHashrateData.length == 0 ) {
        $('#gpuHashrateCnt').hide();
    }
    else
    {
        $('#gpuHashrateCnt').show();
        d3.select('#gpuHashrate').datum(gpuHashrateData).call(gpuHashrateChart);
        gpuHashrateChart.update();
    }

    if(typeof gpuTemperatureData == 'undefined' || gpuTemperatureData.length == 0 ) {
        $('#gpuTemperatureCnt').hide();
    }else {
        $('#gpuTemperatureCnt').show();
        d3.select('#gpuTemperature').datum(gpuTemperatureData).call(gpuTemperatureChart);
        gpuTemperatureChart.update();
    }


    if(typeof gpuFanData == 'undefined' || gpuFanData.length == 0 ) {
        $('#gpuFanCnt').hide();
    }else {
        $('#gpuFanCnt').show();
        d3.select('#gpuFan').datum(gpuFanData).call(gpuFanChart);
        gpuFanChart.update();
    }
}

function displayCharts(){
    if (typeof nv === 'undefined') return false;
    nv.addGraph(function() {
        poolHashrateChart = nv.models.lineChart()
            .margin({left: 60, right: 40})
            .x(function(d){ return d[0] })
            .y(function(d){ return d[1] })
            .useInteractiveGuideline(true);

        poolHashrateChart.xAxis.tickFormat(timeOfDayFormat);

        poolHashrateChart.yAxis.tickFormat(function(d){
            return getReadableHashRateString(d);
        });

        d3.select('#userHashrate').datum(poolHashrateData).call(poolHashrateChart);

        return poolHashrateChart;
    });

    nv.addGraph(function() {
        gpuHashrateChart = nv.models.lineChart()
            .margin({left: 60, right: 40})
            .x(function(d){ return d[0] })
            .y(function(d){ return d[1] })
            .useInteractiveGuideline(true);

        gpuHashrateChart.xAxis.tickFormat(timeOfDayFormat);

        gpuHashrateChart.yAxis.tickFormat(function(d){
            return getReadableHashRateString(d*1000);
        });

        d3.select('#gpuHashrate').datum(gpuHashrateData).call(gpuHashrateChart);

        return gpuHashrateChart;
    });

    nv.addGraph(function() {
        gpuTemperatureChart = nv.models.lineChart()
            .margin({left: 60, right: 40})
            .x(function(d){ return d[0] })
            .y(function(d){ return d[1] })
            .useInteractiveGuideline(true);

        gpuTemperatureChart.xAxis.tickFormat(timeOfDayFormat);

        gpuTemperatureChart.yAxis.tickFormat(function(d){
            return d.toString();
        });

        d3.select('#gpuTemperature').datum(gpuTemperatureData).call(gpuTemperatureChart);

        return gpuTemperatureChart;
    });

    nv.addGraph(function() {
        gpuFanChart = nv.models.lineChart()
            .margin({left: 60, right: 40})
            .x(function(d){ return d[0] })
            .y(function(d){ return d[1] })
            .useInteractiveGuideline(true);

        gpuFanChart.xAxis.tickFormat(timeOfDayFormat);

        gpuFanChart.yAxis.tickFormat(function(d){
            return d.toString();
        });

        d3.select('#gpuFan').datum(gpuFanData).call(gpuFanChart);

        return gpuFanChart;
    });
}
function getReadableHashRateString(hashrate){
    var i = -1;
    var byteUnits = [ ' KH', ' MH', ' GH', ' TH', ' PH' ];
    do {
        hashrate = hashrate / 1024;
        i++;
    } while (hashrate > 1024);
    hashrate = i > 1 ? Math.round(hashrate * 100) / 100 : Math.round(hashrate);
    return hashrate + byteUnits[i];
}

function timeOfDayFormat(timestamp){
    var dStr = d3.time.format('%I:%M %p')(new Date(timestamp));
    if (dStr.indexOf('0') === 0) dStr = dStr.slice(1);
    return dStr;
}

function getSummaryStats(){
    $.post('/api/user/historystats', function(response){
        var connections=[];
        poolHashrateData = [];
        gpuHashrateData=[];
        gpuTemperatureData=[];
        gpuFanData=[];
        for( var r in response.result)
        {
            var curr = response.result[r];
            if( curr.Time != undefined && curr.hashrate != undefined)
                connections.push([curr.Time, curr.hashrate]);
        }

        poolHashrateData.push({key : "Calculated hashrate", values : connections});
        TriggerChartUpdates();
    }, "json");
    if (document.getElementById('farmselectorButton')) $('#farmselectorButton').html('Сводка<span class="caret"></span>');
}

var init = function () {
    displayCharts();
    getSummaryStats();
    $.getJSON('/api/pool_stats', function (data) {
        statData = data;
        TriggerChartUpdates();
    });
    nv.utils.windowResize(TriggerChartUpdates);
    if ("EventSource" in window){
        statsSource.addEventListener('message', function (e) {
            var stats = JSON.parse(e.data);
            statData.push(stats);
            displayCharts();
            TriggerChartUpdates();
        });
    }
}();