function checkUser(){
    apiRequest('checkUser', {}, function(response){
        if (response.result){
            tryGetPayments();
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

function tryGetPayments(){
    var username =  $('#username').val();
    apiRequest('payments', {username: username}, function(response){
        showPayments(response.dataArray);
    });
}

let showPayments = function(payments){
    let tbl = payments.map(function(res){
        return '<tr><td>' + res.user + '</td>' +
            '<td>' + res.coin + '</td>' +
            '<td>' + wrapForTextClip('<a href="https://etherscan.io/tx/' + res.tx + '" target="_blank">' + res.tx + '</a>',res.tx) + '</td>' +
            '<td>' + wrapForTextClip(res.to,res.to) + '</td>' +
            '<td>' + res.transaction.total_amount.toFixed(5) + '</td>' +
            '<td>' + res.transaction.amount.toFixed(5) + '</td>' +
            '<td>' + res.transaction.amount_affiliate.toFixed(5) + '</td>' +
            '<td>' + new Date(res.time*1000).toLocaleString() + '</td></tr>';
    }).join('');
    if (tbl.length === 0) tbl = '<tr><td colspan="8" align="center"> None </td></tr>';

    $('#payments').html(tbl);

    $('#tblpayments>table').tablesaw().data( "tablesaw" ).refresh();
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
    $('#filterForm').submit( function(event) {
        event.preventDefault();
        tryGetPayments();
    });
});