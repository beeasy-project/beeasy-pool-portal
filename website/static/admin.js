var timerId = null;
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
    apiRequest('logout', {}, function(response){
        location.assign('/admin');
    });
}

function tryGetLiveStats(){
    apiRequest('live', {}, function(response){
        showLive(response.result);
    });
    timerId = setInterval( function (){
        apiRequest('live', {}, function(response){
            showLive(response.result);
        });
    }, 10000);
}

function trySendCommand(farm, command)
{
    apiRequest('command', {farm: farm, command: command}, function(response){
        alert(response);
    });
}

var showLive = function(connections){

    var tbl = Object.values(connections).map(function(connection){
        var res = JSON.parse(connection);
        var hashrate =  0;
        var temp=[];
        var speed=[];

        var commandswitcher = '<div class="btn-group"><button type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown" aria-expanded="false">None <span class="caret"></span></button>';
        commandswitcher += '<ul class="dropdown-menu" role="menu">';
        ['restart','stop','start','reboot'].forEach(function (commandname) {
            commandswitcher += '<li style="z-index:1000!important"><a href="javascript:void(0)" onclick="trySendCommand(\''+res.Name+'\', this.innerHTML)">'+commandname+'</a></li>';
        });
        commandswitcher += '</ul></div>';

        if(res.Stat === undefined || Object.keys(res.Stat).length === 0)
        {
            return '<tr><td>'+ res.Name + '</td><td>'+ res.IP + '</td><td colspan="6">' + 'undefined' + '</td></tr>';
        }else{
            return '<tr><td><a href="javascript:void(0)" class="statlink" onclick="clickLink(\'' +res.Hash + '\', event,\''+res.Name+'\')">'+ res.Name + '</a></td><td>'+ res.IP +
                '</td><td>' + res.Stat.hashrate +'</td><td>' + res.Stat.gpuhashrate.toString() +
                '</td><td>'+ res.Stat.temperature.toString() +'</td><td>'+ res.Stat.speed.toString() + '</td><td>' + res.curcoin.toString() +
                '</td><td>'+ commandswitcher + '</td></tr>'
        }

    }).join('');
    $('#live').html(tbl);
    $('#tbllive>table').removeData();
    $('#tbllive').trigger( 'enhance.tablesaw' )
};
function clickLink(link, event, fname)
{
    event.preventDefault();
    GetConnectionStat( link );
}

function apiRequest(func, data, callback){
    var httpRequest = new XMLHttpRequest();
    httpRequest.onreadystatechange = function(){
        if (httpRequest.readyState === 4 && httpRequest.responseText){
            if (httpRequest.status === 401){
                alert('Incorrect Password Or Admin does not exist');
            }
            else{
                var response = JSON.parse(httpRequest.responseText);
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
});