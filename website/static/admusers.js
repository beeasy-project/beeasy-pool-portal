function getuserlist()
{
    var username =  $('#username').val();
    apiRequest( 'user', {username: username}, function(response){
        if (!response.error) showUsers( response.dataArray );
    });
}

var showUsers = function(users){

    var tbl = users.map(function(res){
        var wallets = res.userdata.Wallets.map(function(wallet){
            return wallet.name + ': ' + wallet.value;
        }).join('</br>');
        var poffs = res.userdata.Payoffs.map(function(poff){
            return poff.recipient + ': ' + poff.subject;
        }).join('</br>');
        return '<tr><td>' + res.userdata.id + '</td><td>' + res.name + '</td><td>'+ res.userdata.telegram + '</td><td>' + wallets + '</td><td>' +
            poffs + '</td><td>' + '<a href="/admin/user/' + res.name + '">Edit payoffs</a>' + '</td></tr>';
    }).join('');
    if (tbl.length === 0) tbl = '<tr><td colspan="6" align="center"> None </td></tr>';

    $('#users').html(tbl);
    $('#tblusers>table').removeData();
    $( "#tblusers" ).trigger( 'enhance.tablesaw' )
};

var showPayoffs = function(payoffs){

    var tbl = payoffs.map(function(res){
        return '<tr><td>' + res.recipient + '</td><td>' + res.percent + '</td><td>'+ res.subject +
            '</td><td>' + '<a href="javascript:void(0)" onclick=tryDeletePayoff(\'' + res.recipient + '\')>Delete</a>' + '</td></tr>';
    }).join('');
    if (tbl.length === 0) tbl = '<tr><td colspan="4" align="center"> None </td></tr>';

    $('#users').html(tbl);
    $('#tblusers>table').removeData();
    $( "#tblusers" ).trigger( 'enhance.tablesaw' )
};

function tryAddPayoff(recipient, percent, subject){
    apiRequest('payoff', {user:user.name, recipient:recipient, percent:percent, subject:subject}, function(response){
        if (response.result)
            location.reload(true);
        else alert(response.error);
    });
}

function tryDeletePayoff(recipient){
    apiRequest('payoffdelete', {user:user.name, recipient:recipient}, function(response){
        if (response.result)
            location.reload(true);
        else alert(response.error);
    });
}

var init = function () {
    if (!user) {
        getuserlist();
        $('#page-title').html('Users');
    } else {
        $('#page-title').html('Users: '+user.name+' :Payoffs');
        showPayoffs(user.userdata.Payoffs);
    }
    $('#payoffsForm').submit( function(event){
        event.preventDefault();
        tryAddPayoff( $('#recipient').val(), $('#percent').val(), $('#subject').val());
    });
    $('#filterForm').submit( function(event){
        event.preventDefault();
        getuserlist();
    });
}();