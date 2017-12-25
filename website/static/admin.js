let timerId = null;
let alertsnd = new Audio('/sound/alarm.mp3');
let alertCounter = -1;
function checkUser(){
    apiRequest('checkUser', {}, function(response){
        if (response.result){
            tryGetLiveStats();
        } else {
            location.assign('/admin');
        }
    });
}

function tryLogout(){
    apiRequest('logout', {}, function(){
        location.assign('/admin');
    });
}

function tryGetLiveStats(){
    sendStatRequest();
    timerId = setInterval(sendStatRequest, 30000);
}

function sendStatRequest(){
    let farmlabel =  $('#farmlabel').val();
    let isworking = $('#isworking').is( ":checked" ) ? 1 : 0;
    let isdc = $('#isdc').is( ":checked" ) ? 1 : 0;
    apiRequest('live', {farmlabel: farmlabel, isworking: isworking, isdc:isdc}, function(response){
        showLive(response.result, response.addresult, response.counts);
    });
}

function trySendCommand(farm, command, ip)
{
    apiRequest('command', {farm: farm, command: command, ip:ip}, function(response){
        alert(response);
        if (command === 'stop' || command === 'disableAlert') {
            if (!confirm('Нужно заполнение комментария?')) return false;
            else location.assign('/admin/farm/'+encodeURIComponent(createFarmKey(farm,ip)));
        }
    });
}

let showLive = function(connections, computedHashrates, counts){
    if (!document.getElementById('live')) return false;

    let isNeedAlert = false;
    let tbl = connections.map(function(connection){
        let res = JSON.parse(connection.value);
        let compHR;
        if (computedHashrates && computedHashrates[connection.key] !== undefined){
            compHR = JSON.parse(computedHashrates[connection.key]);
        }

        let commandswitcher = '<div class="btn-group"><button type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown" aria-expanded="false">None <span class="caret"></span></button>';
        commandswitcher += '<ul class="dropdown-menu" role="menu">';
        ['restart','stop','start','reboot','disableAlert','delete'].forEach(function (commandname) {
            commandswitcher += '<li style="z-index:1000!important"><a href="javascript:void(0)" onclick="trySendCommand(\''+res.Name+'\', this.innerHTML, \''+res.IP+'\')">'+commandname+'</a></li>';
        });
        commandswitcher += '</ul></div>';

        let updownTime = Date.now() - (res.status === 1 ? res.upTime : res.Time);
        if (res.status === 2) isNeedAlert = true;

        let returnedString = '<tr class="'+ (res.status === 2 ? "danger" : (res.status === 1 ? "success" : "active")) + '">' +
            '<td>' + res.Name + '</td><td>' + formatIP(res.IP) + '</td>';

        if (res.status === 0){
            returnedString += '<td colspan="5">Отключена</td><td>' + secondsToHms(updownTime / 1000) + '</td><td>' + commandswitcher +
                '</td><td>' + '<a href="/admin/farm/' + encodeURIComponent(connection.key) + '">Edit</a>' + '</td></tr>';
        } else if ((res.Stat === undefined || res.Stat.hashrate === undefined) && compHR === undefined) {
            returnedString += '<td colspan="5">нет данных статистики</td><td>' + secondsToHms(updownTime / 1000) + '</td><td>' + commandswitcher +
                '</td><td>' + '<a href="/admin/farm/' + encodeURIComponent(connection.key) + '">Edit</a>' + '</td></tr>';
        } else if (res.Stat === undefined || res.Stat.hashrate === undefined){
            returnedString += '<td>' + getReadableMHashRateString(compHR.hashrate) + '</td><td colspan="4">нет данных статистики</td><td>' +
                secondsToHms(updownTime / 1000) + '</td><td>' + commandswitcher +
                '</td><td>' + '<a href="/admin/farm/' + encodeURIComponent(connection.key) + '">Edit</a>' + '</td></tr>';
        } else {
            returnedString = '<tr class="'+ (res.status === 2 ? "danger" : (res.status === 1 ? "success" : "active")) + '">' +
                '<td><a href="javascript:void(0)" class="statlink" onclick="clickLink(\'' +res.Hash + '\', event,\''+res.Name+'\')">'+ res.Name + '</a></td><td>'+ formatIP(res.IP) +
                '</td><td>' + getReadableMHashRateString(res.Stat.hashrate * 1024) +'</td><td>' + formatHRString(res.Stat.gpuhashrate.toString()) +
                '</td><td>' + formatTempString(res.Stat.temperature.toString()) + '</td><td>' + formatFanString(res.Stat.speed.toString()) + '</td><td>' + res.curcoin.toString() +
                '</td><td>' + secondsToHms(updownTime / 1000) + '</td><td>'+ commandswitcher + '</td><td>'+ '<a href="/admin/farm/' + encodeURIComponent(connection.key) + '">Edit</a>' + '</td></tr>'
        }

        return returnedString;
    }).join('');
    $('#live').html(tbl);

    if (isNeedAlert) alertCounter += 1;
    else alertCounter = -1;
    if (alertCounter % 2 === 0) alertsnd.play();

    let countsInfo = 'Требует решений:<span style="color:red">' + counts.alerted + '</span>, работает:<span style="color:blue">' + counts.working + '</span>, отключено:' + counts.stopped;
    $('#farmcounts_info').html(countsInfo);

    $('#tbllive>table').tablesaw().data( "tablesaw" ).refresh();
};

function clickLink(link, event, fname)
{
    event.preventDefault();
    GetConnectionStat( link, fname );
}

function apiRequest(func, data, callback){
    let httpRequest = new XMLHttpRequest();
    httpRequest.onreadystatechange = function(){
        if (httpRequest.readyState === 4 && httpRequest.responseText){
            if (httpRequest.status === 401){
                alert('Incorrect Password Or Admin does not exist');
            }
            else{
                let response = JSON.parse(httpRequest.responseText);
                callback(response);
            }
        }
    };
    httpRequest.open('POST', '/api/admin/' + func);
    httpRequest.setRequestHeader('Content-Type', 'application/json');
    httpRequest.send(JSON.stringify(data));
}

$( document ).ready(function(){
    checkUser();
    $('#adminLogout').click( function(event){
        event.preventDefault();
        clearInterval(timerId);
        tryLogout();
    });
    $('#filterForm').submit( function(event){
        event.preventDefault();
        sendStatRequest();
    });
    $('#resetButton').click( function(){
        checkSwitchery(document.querySelector('#isworking'), true);
        checkSwitchery(document.querySelector('#isdc'), true);
    });
});