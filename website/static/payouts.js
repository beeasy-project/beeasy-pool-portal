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
    apiRequest('pendingpayouts', {}, function(response){
        showPayouts(response.result);
    });
}

var transactions = {};
var showPayouts = function(payouts){
    transactions = payouts;
    var tbl = Object.keys(payouts).map(function(payout){
        var amount =  0;

        return '<tr><td>'+ payout + '</td><td>'+
            payouts[payout].address + '</td><td>' +
            payouts[payout].total_amount+ '</td><td>' +
            payouts[payout].amount+ '</td><td>' +
            payouts[payout].amount_affiliate + '</td><td>' +
                payouts[payout].payoffs.map(function(x){
                    return x.subject;
                }).join("<br>") +

            '</td><td>' +
            ( payouts[payout].address !== 'undefined' ? '<a href="javascript:void(0)" onclick=payTo(\'' + payout + '\')>Pay</a>' : '') +
            '</td></tr>';
    }).join('');
    $('#payouts').html(tbl);
};

function payTo(transaction)
{
    apiRequest("payto",{coin : "ethereum", transaction : transactions[transaction]}, function(response) {
        alert(JSON.stringify(response));
    });

}

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
});