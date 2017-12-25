let sort = 'name';
let order = 'asc';
function getuserlist(page)
{
    let username =  $('#username').val();
    apiRequest( 'user', {username: username, page: page, sort:sort, order:order}, function(response){
        if (!response.error) showUsers( response.dataArray, response.datacount, page );
    });
}

let showUsers = function(users, count, page){

    let tbl = users.map(function(res){
        let wallets = res.userdata.Wallets.map(function(wallet){
            return wallet.name + ': ' + wallet.value;
        }).join('</br>');
        let poffs = res.userdata.Payoffs.map(function(poff){
            return poff.recipient + ': ' + poff.subject;
        }).join('</br>');
        return '<tr><td>' + res.userdata.id + '</td><td>' + res.name + '</td><td>' + res.userdata.telegram + '</td><td>' + wallets + '</td><td>' +
            res.userdata.curbalance.toFixed(7) + '</td><td>' + poffs + '</td><td>' +
            '<a href="/admin/user/' + res.name + '">Edit payoffs</a><br/>' +
            '<a href="javascript:void(0)" onclick=\'setDCFee(\"' + res.name + '\")\'>Set DC Fee</a>' + '</td></tr>';
    }).join('');
    if (tbl.length === 0) tbl = '<tr><td colspan="7" align="center"> None </td></tr>';

    $('#users').html(tbl);

    $('#tblusers>table').tablesaw().data( "tablesaw" ).refresh();

    paginate($('#pagination'), count, page, getuserlist);
};

let showPayoffs = function(payoffs){

    let tbl = payoffs.map(function(res){
        return '<tr><td>' + res.recipient + '</td><td>' + res.percent + '</td><td>'+ res.subject +
            '</td><td>' +
                '<a href="javascript:void(0)" onclick=\'editPayoff(\"' + res.recipient + '\",\"' + res.percent + '\",\"' + res.subject.split('%: ')[1].toString() + '\")\'>Edit</a>&nbsp;&nbsp;&nbsp;' +
                '<a href="javascript:void(0)" onclick=tryDeletePayoff(\'' + res.recipient + '\')>Delete</a>' +
            '</td></tr>';
    }).join('');
    if (tbl.length === 0) tbl = '<tr><td colspan="4" align="center"> None </td></tr>';

    $('#users').html(tbl);

    $('#tblusers>table').tablesaw().data( "tablesaw" ).refresh();
};

function setDCFee(uName){
    user = {name:uName};
    tryAddPayoff("datacenter", "0.1", "datacenter fee", true)
}

function editPayoff(recipient, percent, subject){
    $('#recipient').val(recipient);
    $('#percent').val(percent);
    $('#subject').val(subject);
}

function tryAddPayoff(recipient, percent, subject, isFromList){
    apiRequest('payoff', {user:user.name, recipient:recipient, percent:percent, subject:subject}, function(response){
        if (response.result)
            isFromList ? getuserlist() : location.reload(true);
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

let init = function () {
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
    $('.sorting,.sorting_asc,.sorting_desc').click(function(event){
        event.preventDefault();
        switch(this.className){
            case 'sorting': {
                $('.sorting_asc,.sorting_desc').removeClass( "sorting_asc" ).removeClass( "sorting_desc" ).addClass( "sorting" );
                $(this).removeClass( "sorting" ).addClass( "sorting_asc" );
                order = 'asc';
                break
            }
            case 'sorting_asc': {
                $(this).removeClass( "sorting_asc" ).addClass( "sorting_desc" );
                order = 'desc';
                break
            }
            case 'sorting_desc': {
                $(this).removeClass( "sorting_desc" ).addClass( "sorting_asc" );
                order = 'asc';
                break
            }
        }
        sort = this.innerText ? this.innerText.toLowerCase() : 'name';
        getuserlist();
        return false;
    });
}();