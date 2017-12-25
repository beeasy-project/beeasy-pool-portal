function checkUser(){
    apiRequest('checkUser', {}, function(response){
        if (response.result){
            displayFarmData(farm);
        } else {
            location.assign('/admin');
        }
    });
}

function tryLogout(){
    apiRequest('logout', {}, function(response){
        location.assign('/admin');
    });
}

let displayFarmData = function(farm){
    if (!document.getElementById('farm')) return false;

    let res = JSON.parse(farm.value);
    let updownTime = Date.now() - (res.status === 1 ? res.upTime : res.Time);
    let tblData;

    if(res.Stat === undefined || Object.keys(res.Stat).length === 0)
    {
        tblData = '<tr class="'+ (res.status === 2 ? "danger" : (res.status === 1 ? "success" : "active")) + '">' +
            '<td>'+ res.Name + '</td><td>'+ formatIP(res.IP) + '</td><td colspan="5">' + 'нет данных статистики' +
            '</td><td>' + secondsToHms(updownTime / 1000) + '</td></tr>'
    } else {
        tblData = '<tr class="'+ (res.status === 2 ? "danger" : (res.status === 1 ? "success" : "active")) + '">' +
            '<td>'+ res.Name + '</td><td>'+ formatIP(res.IP) +
            '</td><td>' + getReadableHashRateString(res.Stat.hashrate * 1024) +'</td><td>' + formatHRString(res.Stat.gpuhashrate.toString()) +
            '</td><td>' + formatTempString(res.Stat.temperature.toString()) + '</td><td>' + formatFanString(res.Stat.speed.toString()) + '</td><td>' + res.curcoin.toString() +
            '</td><td>' + secondsToHms(updownTime / 1000) + '</td></tr>'
    }

    $('#farm').html(tblData);
    $('#comment').val(res.description);

    $('#tblfarm>table').tablesaw().data( "tablesaw" ).refresh();
};

function trySetFarm(){
    let description = $('#comment').val();
    apiRequest('editfarm', {label:farm.key, description:description}, function(response){
        if (response.result)
            location.reload(true);
        else alert(response.error);
    });
}

function apiRequest(func, data, callback){
    let httpRequest = new XMLHttpRequest();
    httpRequest.onreadystatechange = function(){
        if (httpRequest.readyState === 4 && httpRequest.responseText){
            if (httpRequest.status === 401){
                alert('Incorrect Password');
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
        tryLogout();
    });
    $('#commentForm').submit( function(event) {
        event.preventDefault();
        trySetFarm();
    });
});