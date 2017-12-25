function checkUser(){
    apiRequest('checkUser', {}, function(response){
        if (response.result){
            tryPendingpayouts();
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

function tryPendingpayouts(){
    let username =  $('#username').val();
    let isenougth = $('#isenougth').is( ":checked" ) ? 1 : 0;
    apiRequest('pendingpayouts', {username: username, isenougth: isenougth}, function(response){
        showPayouts(response.result);
    });
}

let transactions = {};
let showPayouts = function(payouts){
    transactions = payouts;
    let tbl = Object.keys(payouts).map(function(payout){
        let res =  payouts[payout];

        return '<tr><td>'+ payout + '</td><td>'+
            wrapForTextClip(res.address,res.address) + '</td><td>' +
            parseFloat(res.total_amount).toFixed(5) + '</td><td>' +
            parseFloat(res.amount).toFixed(5) + '</td><td>' +
            res.amount_affiliate.toFixed(5) + '</td><td>' +
            res.payoffs.map(function(x){
                return x.subject;
            }).join("<br>") + '</td><td>' +
            ( payouts[payout].address !== 'undefined' &&  payouts[payout].status === 0 ? '<a href="javascript:void(0)" onclick=payTo(\'' + payout + '\')>Pay</a>' :  payouts[payout].status === 1 ? 'in process' : '') +
            '</td></tr>';
    }).join('');
    $('#payouts').html(tbl);

    $('#tblpayouts>table').tablesaw().data( "tablesaw" ).refresh();
};

function payTo(transaction)
{
    apiRequest("payto",{coin : "ethereum", transaction : transactions[transaction]}, function(response) {
        alert(JSON.stringify(response));
        $('#searchButton').click();
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
    httpRequest.open('POST', '/api/payout/' + func);
    httpRequest.setRequestHeader('Content-Type', 'application/json');
    httpRequest.send(JSON.stringify(data));
}

$( document ).ready(function(){
    checkUser();
    $('#adminLogout').click( function(event){
        event.preventDefault();
        tryLogout();
    });
    $('#filterForm').submit( function(event){
        event.preventDefault();
        tryPendingpayouts();
    });
    $('#resetButton').click( function(){
        checkSwitchery(document.querySelector('#isenougth'), true);
    });
});