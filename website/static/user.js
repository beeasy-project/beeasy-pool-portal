var userinfo;
var balance;

function checkUser(){
    apiRequest('checkUser', {}, function(response){
        if (response.result){
            tryGetUserInfo();
            tryGetLiveStats();
        } else {
            location.assign('/auth');
        }
    });
}

function tryLogout(){
    apiRequest('logout', {}, function(response){
        location.assign('/auth');
    });
}

function tryGetUserInfo(){
    apiRequest('getuserinfo', {}, function(response){
        userinfo = response.result;
        $('#username').html(response.result.name);
        $('#username2').html(response.result.name);
        showUserInfo();
        showUserTelegram();
        showUserSettings();
    });
    apiRequest('getuserbalance', {}, function(response){
        balance = response.result.balance;
        showUserBalance();
    });
    if (document.getElementById('lastpayoutsdata'))
        apiRequest('lastpayouts', {}, function(response){
            if (!response.error) showLastPayouts( response.dataArray );
        });
}

function tryGetLiveStats()
{
    apiRequest('livestats', {}, function(response){
        showLive( response.result, response.coins);
    });
}

function trySaveSettings()
{
    var tfauth = $('#tfauth').is( ":checked" ) ? 'telegram' : 'none';
    apiRequest('settings', {tfauth: tfauth, confcode:$('#settingsconf').val()}, function(response){
        if (!response.result){
            if (response.conf) {
                $('#settingsconf').val('');
                $('#settingsconfwrapper').show();
            }
            alert(response.error);
        } else {
            $('#settingsconfwrapper').hide();
            $('#settingsconf').val('new');
        }
    });
}

function trySaveWallet(walletStr, settings, confcode)
{
    apiRequest('addwallet', {wallets: walletStr, confcode:confcode, settings:settings}, function(response){
        if (!response.result){
            if (response.conf) {
                $('#walletconf').val('');
                $('#walletconfwrapper').show();
            }
            alert(response.error);
        } else {
            $('#walletconfwrapper').hide();
            $('#walletconf').val('new');
        }
    });
}

function displayMenu(pools){
    $('#poolList').after(Object.keys(pools).map(function(poolName){
        return '<li class="poolMenuItem"><a href="#">' + poolName + '</a></li>';
    }).join(''));
}

function tryCoinSwitch(farm, coin)
{
    apiRequest('coinswitch', {farm: farm, coin: coin}, function(response){
        alert(response);
    });
}

function trySendCommand(farm, command)
{
    apiRequest('command', {farm: farm, command: command}, function(response){
        alert(response);
    });
}

var showLive = function(connections, coins){

    var tbl = Object.values(connections).map(function(connection){
        var res = JSON.parse(connection);
        var hashrate =  0;
        var temp=[];
        var speed=[];

        var coinswitcher = '<div class="btn-group"><button type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown" aria-expanded="false">'+res.curcoin+' <span class="caret"></span></button>';
        coinswitcher += '<ul class="dropdown-menu" role="menu">';
        coins.forEach(function (coinname) {
            coinswitcher += '<li'+(coinname.toString() === res.curcoin.toString()?' class="active"':'')+'><a href="javascript:void(0)" onclick="tryCoinSwitch(\''+res.Name+'\', this.innerHTML)">'+coinname+'</a></li>';
        });
        coinswitcher += '</ul></div>';

        var commandswitcher = '<div class="btn-group"><button type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown" aria-expanded="false">None <span class="caret"></span></button>';
        commandswitcher += '<ul class="dropdown-menu" role="menu">';
        ['restart','stop','start','reboot'].forEach(function (commandname) {
            commandswitcher += '<li><a href="javascript:void(0)" onclick="trySendCommand(\''+res.Name+'\', this.innerHTML)">'+commandname+'</a></li>';
        });
        commandswitcher += '</ul></div>';

        if(res.Stat === undefined || res.Stat.hashrate == undefined )
        {
            return '<tr><td>'+res.Name + '</td><td>'+ res.IP + '</td><td colspan="7">' + 'undefined' + '</td></tr>';
        }else{
            return '<tr><td><a href="javascript:void(0)" class="statlink">' +res.Name + '</a></td><td>'+ res.IP +
                '</td><td>' + res.Stat.hashrate.toString() + '</td><td>' + res.Stat.gpuhashrate.toString() +
                '</td><td>' + res.Stat.temperature.toString() + '</td><td>' + res.Stat.speed.toString() + '</td><td>' + res.curcoin.toString() +
                '</td><td>' + coinswitcher + '</td><td>' + commandswitcher + '</td></tr>';
        }

    }).join('');

    $('#farms').html(tbl);
    $('#tblfarms>table').removeData();
    $( "#tblfarms" ).trigger( 'enhance.tablesaw' )
};

var showUserBalance = function()
{
    var balanceStr = "";
    Object.keys(balance).forEach(function(coin) {
        balanceStr += '<p class="header-title m-b-30">' + coin + ': ' + balance[coin].balance.toFixed(5) + "&nbsp;" + balance[coin].sym + '</p>'
    });
    $('#balance').html(balanceStr);
};

var showUserTelegram = function()
{
    if( typeof userinfo.telegram == "undefined" ) {
        $('#telegram').html('@easypoolbot is not connected.');
    }else {
        $('#telegram').html('@easypoolbot is connected!');
    }
};

var showUserInfo = function() {
    if (typeof userinfo != 'undefined' && typeof userinfo.wallets != undefined) {
        for (var w in userinfo.wallets) {
            $('#' + w.replace(/\s/gi,'')).val(userinfo.wallets[w]);
        }
    }
};

var showUserSettings = function()
{
    if( typeof userinfo.settings !== "undefined" && userinfo.settings) {
        if (userinfo.settings.tfauth && userinfo.settings.tfauth !== 'none' && document.getElementById('tfauth')){
            checkSwitchery(document.querySelector('#tfauth'), true);
        }
        $('input[name^="minpayments_"]').each(function() {
            if (userinfo.settings[this.id]) $(this).val(userinfo.settings[this.id]);
        });
    }
    if (typeof userinfo !== 'undefined' && typeof userinfo.refcode !== 'undefined' && userinfo.refcode.length>0) {
        $('#reflink').val(new URL('/auth?refcode='+userinfo.refcode+'#register',window.location.origin).toString());
    }
};

var showLastPayouts = function(payouts){
    if (!document.getElementById('lastpayoutsdata')) return false;

    var tbl = payouts.map(function(res){

        return '<tr><td>' +res.coin + '</td><td>' +res.tx + '</td><td>'+ res.to + '</td><td>' + res.transaction.amount.toFixed(5) +
            '</td><td>'+ res.transaction.amount_affiliate.toFixed(5) + '</td><td>' + new Date(res.time*1000).toLocaleString() + '</td></tr>';
    }).join('');
    if (tbl.length === 0) tbl = '<tr><td colspan="6" align="center"> None </td></tr>';

    $('#lastpayoutsdata').html(tbl);
    $('#tbltrans>table').removeData();
    $( "#tbltrans" ).trigger( 'enhance.tablesaw' )
};
function apiRequest(func, data, callback){
    var httpRequest = new XMLHttpRequest();
    httpRequest.onreadystatechange = function(){
        if (httpRequest.readyState === 4 && httpRequest.responseText){
            if (httpRequest.status === 401){
                alert('Incorrect Password');
            }
            else{
                var response = JSON.parse(httpRequest.responseText);
                callback(response);
            }
        }
    };
    httpRequest.open('POST', '/api/user/' + func);
    httpRequest.setRequestHeader('Content-Type', 'application/json');
    var curreq = JSON.stringify(data);
    httpRequest.send(curreq);
}

$('#walletsForm').submit( function(event){
    event.preventDefault();
    var wallets = new Object();
    var minPayments = new Object();
    $('input[name^="wal_"]').each(function() {
        var el = $(this);
        wallets[el[0].id] = el[0].value;
    });
    $('input[name^="minpayments_"]').each(function() {
        var el = $(this);
        minPayments[el[0].id.substr(el[0].id.indexOf("_")+1, el[0].id.length)] = el[0].value;
    });
    trySaveWallet( JSON.stringify(wallets), JSON.stringify(minPayments), $('#walletconf').val());
});

function clickLink(link, event, fname)
{
    event.preventDefault();
    GetConnectionStat( link );
    if (document.getElementById('farmselectorButton')) $('#farmselectorButton').html(fname + ' <span class="caret"></span>');
}

function showSelector(connections, coins){

    var farmSelector = '<div class="btn-group"><button id="farmselectorButton" type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown" aria-expanded="false">Summary <span class="caret"></span></button>';
    farmSelector += '<ul class="dropdown-menu" role="menu">';
    farmSelector += '<li><a href="javascript:void(0)" onclick="getSummaryStats()">Summary</a></li>';
    Object.values(connections).forEach(function (connection) {
        var res = JSON.parse(connection);
        farmSelector += '<li><a href="javascript:void(0)" onclick="clickLink(\'' +res.Hash + '\', event,\''+res.Name+'\')">'+res.Name+'</a></li>';
    });
    farmSelector += '</ul></div>';

    $('#farmselectorwrapper').html(farmSelector);
}

$( document ).ready(function(){
    checkUser();
    $('#userLogout').click( function(event){
        event.preventDefault();
        tryLogout();
    });
});