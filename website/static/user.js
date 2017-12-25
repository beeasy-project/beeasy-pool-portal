"use strict";

let userInfo;
let balance;

function checkUser() {
    apiRequest('checkUser', {}, function (response) {
        if (response.result) {
            tryGetUserInfo();
            tryGetLiveStats();
        } else {
            location.assign('/auth');
        }
    });
}

function tryLogout() {
    apiRequest('logout', {}, () => {
        location.assign('/auth');
    });
}

function tryGetUserInfo() {
    apiRequest('getuserinfo', {}, function (response) {
        userInfo = response.result;
        $('#username').html(response.result.name);
        $('#username2').html(response.result.name);
        showUserInfo();
        showUserTelegram();
        showUserSettings();
    });
    apiRequest('getuserbalance', {}, function (response) {
        balance = response.result.balance;
        showUserBalance();
    });
    if (document.getElementById('lastpayoutsdata'))
        apiRequest('lastpayouts', {}, function (response) {
            if (!response.error) showLastPayouts(response.dataArray);
        });
    if (document.getElementById('payoffs'))
        apiRequest('commissions', {}, function (response) {
            if (!response.error) showUserCommissions(response.dataArray);
        });
}

function tryGetLiveStats() {
    apiRequest('livestats', {}, function (response) {
        showLive(response.result, response.coins, response.addresult);
        showUserMiningEstimation(response.result, response.blockTime, response.netHashrate, response.coinsSymbols);
    });
}

function trySaveSettings() {
    let tfauth = $('#tfauth').is(":checked") ? 'telegram' : 'none';
    apiRequest('settings', {tfauth: tfauth, confcode: $('#settingsconf').val()}, function (response) {
        if (!response.result) {
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

function trySaveWallet(walletStr, settings, confcode) {
    apiRequest('addwallet', {wallets: walletStr, confcode: confcode, settings: settings}, function (response) {
        if (!response.result) {
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

function tryCoinSwitch(farm, coin) {
    apiRequest('coinswitch', {farm: farm, coin: coin}, function (response) {
        alert(response);
    });
}

function trySendCommand(farm, command, ip) {
    apiRequest('command', {farm: farm, command: command, ip: ip}, function (response) {
        alert(response);
    });
}

let showLive = function (connections, coins, computedHashrates) {
    if (!document.getElementById('farms')) return false;

    let tbl = Object.keys(connections).map(function (connection) {
        let res = JSON.parse(connections[connection]);
        let compHR;
        if (computedHashrates && computedHashrates[connection] !== undefined){
            compHR = JSON.parse(computedHashrates[connection]);
        }

        let coinswitcher = '<div class="btn-group"><button type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown" aria-expanded="false">' + res.curcoin + ' <span class="caret"></span></button>';
        coinswitcher += '<ul class="dropdown-menu" role="menu">';
        coins.forEach(function (coinname) {
            coinswitcher += '<li' + (coinname.toString() === res.curcoin.toString() ? ' class="active"' : '') + '><a href="javascript:void(0)" onclick="tryCoinSwitch(\'' + res.Name + '\', this.innerHTML)">' + coinname + '</a></li>';
        });
        coinswitcher += '</ul></div>';

        let commandswitcher = '<div class="btn-group"><button type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown" aria-expanded="false">None <span class="caret"></span></button>';
        commandswitcher += '<ul class="dropdown-menu" role="menu">';
        ['restart', 'stop', 'start', 'reboot', 'delete'].forEach(function (commandname) {
            commandswitcher += '<li><a href="javascript:void(0)" onclick="trySendCommand(\'' + res.Name + '\', this.innerHTML, \'' + res.IP + '\')">' + commandname + '</a></li>';
        });
        commandswitcher += '</ul></div>';

        let updownTime = Date.now() - (res.status === 1 ? res.upTime : res.Time);
        let returnedString = '<tr class="'+ (res.status === 2 ? "danger" : (res.status === 1 ? "success" : "active")) + '">' +
            '<td>' + res.Name + '</td><td>' + formatIP(res.IP) + '</td>';

        if (res.status === 0){
            returnedString += '<td colspan="5">Отключена</td><td>' + secondsToHms(updownTime / 1000) + '</td><td></td><td>' + commandswitcher + '</td></tr>';
        } else if ((res.Stat === undefined || res.Stat.hashrate === undefined) && compHR === undefined) {
            returnedString += '<td colspan="5">нет данных статистики</td><td>' + secondsToHms(updownTime / 1000) + '</td><td></td><td>' + commandswitcher + '</td></tr>';
        } else if (res.Stat === undefined || res.Stat.hashrate === undefined){
            returnedString += '<td>' + getReadableMHashRateString(compHR.hashrate) + '</td><td colspan="4">нет данных статистики</td><td>' +
                secondsToHms(updownTime / 1000) + '</td><td></td><td>' + commandswitcher + '</td></tr>';
        } else {
            returnedString = '<tr class="'+ (res.status === 2 ? "danger" : (res.status === 1 ? "success" : "active")) + '">' +
                '<td><a href="javascript:void(0)" class="statlink">' + res.Name + '</a></td><td>' + formatIP(res.IP) +
                '</td><td>' + getReadableMHashRateString(res.Stat.hashrate * 1024) + '</td><td>' + formatHRString(res.Stat.gpuhashrate.toString()) +
                '</td><td>' + formatTempString(res.Stat.temperature.toString()) + '</td><td>' + formatFanString(res.Stat.speed.toString()) + '</td><td>' + res.curcoin.toString() +
                '</td><td>' + secondsToHms(updownTime / 1000) + '</td><td>' + coinswitcher + '</td><td>' + commandswitcher + '</td></tr>';
        }

        return returnedString;

    }).join('');

    $('#farms').html(tbl);

    $('#tblfarms>table').tablesaw().data("tablesaw").refresh();
};

let ratesOutput = (sum, usdRate, usdCode, rubRate, rubCode) => {
    if (usdRate !== undefined && rubRate !== undefined && sum !== 0.0.toFixed(7)) {
        return 'data-toggle="tooltip" data-placement="bottom" title="' + (usdRate * sum).toFixed(2) + "&nbsp;" + usdCode + "\n" + (sum * rubRate).toFixed(2) + "&nbsp;" + rubCode + '"';
    }
};

let showUserBalance = function () {
    if (!document.getElementById('balancedata')) return false;

    let tbl = Object.keys(balance).map(function (coin) {
        let res = balance[coin];

        return '<tr><td>' + coin + '</td>' +
            '<td ' + ratesOutput(res.balance.toFixed(7), res.usdRate, res.usdCode, res.rubRate, res.rubCode) + '>' + res.balance.toFixed(7) + "&nbsp;" + res.sym + '</td>' +
            '<td>' + res.shares.toFixed(2) + '</td>' +
            '<td>' + (res.percents * 100).toFixed(2) + '&nbsp;%</td>' +
            '<td ' + ratesOutput(res.balanceshare.toFixed(7), res.usdRate, res.usdCode, res.rubRate, res.rubCode) + '>' + res.balanceshare.toFixed(7) + "&nbsp;" + res.sym + '</td>' +
            '<td ' + ratesOutput((res.balance + res.balanceshare).toFixed(7), res.usdRate, res.usdCode, res.rubRate, res.rubCode) + '>' + (res.balance + res.balanceshare).toFixed(7) + "&nbsp;" + res.sym + '</td>' +
            '<td ' + ratesOutput(res.payments.toFixed(7), res.usdRate, res.usdCode, res.rubRate, res.rubCode) + '>' + res.payments.toFixed(7) + "&nbsp;" + res.sym + '</td>' +
            '<td ' + ratesOutput((res.balance + res.balanceshare + res.payments).toFixed(7), res.usdRate, res.usdCode, res.rubRate, res.rubCode) + '>' + (res.balance + res.balanceshare + res.payments).toFixed(7) + "&nbsp;" + res.sym + '</td></tr>';
    }).join('');

    $('#balancedata').html(tbl);
    $("[data-toggle=tooltip]").tooltip({html: true});

    $('#tblbalance>table').tablesaw().data("tablesaw").refresh();

};

let showUserTelegram = function () {
    if (typeof userInfo.telegram === "undefined" || userInfo.telegram === '') {
        $('#telegram').html('@easypoolbot не подключен.');
    } else {
        $('#telegram').html('@easypoolbot подключен!');
    }
};

let showUserInfo = function () {
    if (typeof userInfo !== 'undefined' && typeof userInfo.wallets !== 'undefined') {
        for (let w in userInfo.wallets) {
            $('#' + w.replace(/\s/gi, '')).val(userInfo.wallets[w]);
        }
    }
};

let showUserSettings = function () {
    if (typeof userInfo.settings !== "undefined" && userInfo.settings) {
        if (userInfo.settings.tfauth && userInfo.settings.tfauth !== 'none' && document.getElementById('tfauth')) {
            checkSwitchery(document.querySelector('#tfauth'), true);
        }
        $('input[name^="minpayments_"]').each(function () {
            if (userInfo.settings[this.id]) $(this).val(userInfo.settings[this.id]);
        });
    }
    if (typeof userInfo !== 'undefined' && typeof userInfo.refcode !== 'undefined' && userInfo.refcode.length > 0) {
        $('#reflink').val(new URL('/auth?refcode=' + userInfo.refcode + '#register', window.location.origin).toString());
    }
};

let showLastPayouts = function (payouts) {
    if (!document.getElementById('lastpayoutsdata')) return false;

    let tbl = payouts.map(function (res) {

        return '<tr><td>' + res.coin + '</td><td><a href="https://etherscan.io/tx/' + res.tx + '" target="_blank">' + res.tx + '</a></td><td>' + res.to + '</td><td>' + res.transaction.total_amount.toFixed(7) +
            '</td><td>' + res.transaction.amount.toFixed(7) + '</td><td>' + res.transaction.amount_affiliate.toFixed(7) +
            '</td><td>' + new Date(res.time * 1000).toLocaleString() + '</td></tr>';
    }).join('');
    if (tbl.length === 0) tbl = '<tr><td colspan="7" align="center"> None </td></tr>';

    $('#lastpayoutsdata').html(tbl);

    $('#tbltrans>table').tablesaw().data("tablesaw").refresh();
};

let showUserCommissions = function (payoffs) {
    if (!document.getElementById('payoffs')) return false;

    let poffs = payoffs.map(function (poff) {
        return poff.subject;
    }).join('</br>');

    $('#payoffs').html(poffs);
};

let showUserMiningEstimation = function (connections, blockTime, netHashrate, coinsSymbols) {
    if (!document.getElementById('miningestimation')) return false;

    let coins = {};
    Object.keys(connections).forEach(function (connection) {
        let res = JSON.parse(connections[connection]);
        if (res.status === 1 && res.Stat !== undefined && res.Stat.hashrate !== undefined) {
            (coins[res.curcoin] === undefined) ? (coins[res.curcoin] = res.Stat.hashrate) :
                (coins[res.curcoin] += res.Stat.hashrate);
        } else {
            (coins[res.curcoin] === undefined) ? (coins[res.curcoin] = undefined) : null;
        }
    });

    let tbl = Object.keys(coins).map(function (key) {
        let res = coins[key];

        if (res === undefined) {
            return '<tr><td>' + key + '</td><td>' + 'Нет данных' + '</td><td>' + 0 + '</td><td>' + 0 + '</td><td>' + 0 + '</td><td>' + 0 + '</td></tr>';
        } else {
            let profitPerHour = ((res * 1e3) / netHashrate) * ((60 / blockTime) * 3) * 60;
            let profitPerDay = profitPerHour * 24;
            let profitPerWeek = profitPerHour * 24 * 7;
            let profitPerMonth = profitPerHour * 24 * 30;
            return '<tr><td>' + key + '</td><td>' + getReadableHashRateString(res * 1024) + '</td><td>' + profitPerHour.toFixed(8) +
                "&nbsp;" + coinsSymbols[key] + '</td><td>' + profitPerDay.toFixed(8) + "&nbsp;" + coinsSymbols[key] +
                '</td><td>' + profitPerWeek.toFixed(8) + "&nbsp;" + coinsSymbols[key] + '</td><td>' +
                profitPerMonth.toFixed(8) + "&nbsp;" + coinsSymbols[key] + '</td></tr>';
        }
    }).join('');

    $('#miningestimation').html(tbl);

    $('#tblcalc>table').tablesaw().data("tablesaw").refresh();

};

function apiRequest(func, data, callback) {
    let httpRequest = new XMLHttpRequest();
    httpRequest.onreadystatechange = function () {
        if (httpRequest.readyState === 4 && httpRequest.responseText) {
            if (httpRequest.status === 401) {
                alert('Incorrect Password');
            }
            else {
                let response = JSON.parse(httpRequest.responseText);
                callback(response);
            }
        }
    };
    httpRequest.open('POST', '/api/user/' + func);
    httpRequest.setRequestHeader('Content-Type', 'application/json');
    let curreq = JSON.stringify(data);
    httpRequest.send(curreq);
}

$('#walletsForm').submit(function (event) {
    event.preventDefault();
    let wallets = {};
    let minPayments = {};
    $('input[name^="wal_"]').each(function () {
        let el = $(this);
        wallets[el[0].id] = el[0].value;
    });
    $('input[name^="minpayments_"]').each(function () {
        let el = $(this);
        minPayments[el[0].id.substr(el[0].id.indexOf("_") + 1, el[0].id.length)] = el[0].value;
    });
    trySaveWallet(JSON.stringify(wallets), JSON.stringify(minPayments), $('#walletconf').val());
});

function clickLink(link, event, fname) {
    event.preventDefault();
    GetConnectionStat(link);
    if (document.getElementById('farmselectorButton')) $('#farmselectorButton').html(fname + ' <span class="caret"></span>');
}

function showSelector(connections, coins) {

    let selector = '<a id="farmselectorButton" href="#" class="dropdown-toggle text-success" data-toggle="dropdown" aria-expanded="false">Сводка<span class="caret"></span></a>';
    selector += '<ul class="dropdown-menu" role="menu">';
    selector += '<li><a href="javascript:void(0)" onclick="getSummaryStats()">Сводка</a></li>';
    Object.keys(connections).forEach(function (connection) {
        let res = JSON.parse(connections[connection]);
        selector += '<li><a href="javascript:void(0)" onclick="clickLink(\'' + res.Hash + '\', event,\'' + res.Name + '\')">' + res.Name + '</a></li>';
    });
    selector += '</ul>';

    $('#farmselectorwrapper').html(selector);
}

$(document).ready(function () {
    checkUser();
    $('#userLogout').click(function (event) {
        event.preventDefault();
        tryLogout();
    });
});