var curcoinstat;
function buildCoinSelector(){
    if (typeof balance === 'undefined') return setTimeout(buildCoinSelector, 100);

    //var selector = '<div class="btn-group"><button id="coinselectorButton" type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown" aria-expanded="false">Last<span class="caret"></span></button>';

    var selector = '<a id="coinselectorButton" href="#" class="dropdown-toggle text-success" data-toggle="dropdown" aria-expanded="false"><i class="zmdi zmdi-more-vert"></i></a>';
    selector += '<ul class="dropdown-menu" role="menu">';
    selector += '<li><a href="javascript:void(0)" onclick="getpayouts(\'Last\')">Last</a></li>';
    Object.keys(balance).forEach(function(coin) {
        selector += '<li><a href="javascript:void(0)" onclick="getpayouts(\''+coin+'\')">'+coin+'</a></li>';
    });
    selector += '</ul>';//</div>';

    $('#coinselectorwrapper').html(selector);
    getpayouts('Last');
}

function getpayouts(coin)
{
    if (curcoinstat === coin) return false;
    curcoinstat = coin;
    apiRequest( coin === 'Last' ? 'lastpayouts' : 'payouts', {coin:coin}, function(response){
        if (!response.error) showPayouts( response.dataArray );
    });
    if (document.getElementById('coinselectorButton')) $('#coinselectorButton').html(coin+'<span class="caret"></span>');
}

var showPayouts = function(payouts){

    var tbl = payouts.map(function(res){
        return '<tr><td>' +res.coin + '</td><td>' +res.tx + '</td><td>'+ res.to + '</td><td>' + res.transaction.amount.toFixed(5) +
                '</td><td>'+ res.transaction.amount_affiliate.toFixed(5) + '</td><td>' + new Date(res.time*1000).toLocaleString() + '</td></tr>';
    }).join('');
    if (tbl.length === 0) tbl = '<tr><td colspan="6" align="center"> None </td></tr>';

    $('#payoutsdata').html(tbl);
    $('#tbltrans>table').removeData();
    $( "#tbltrans" ).trigger( 'enhance.tablesaw' )
};

var init = function () {
    buildCoinSelector();
}();