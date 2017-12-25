let curcoinstat;
function buildCoinSelector(){
    if (typeof balance === 'undefined') return setTimeout(buildCoinSelector, 100);

    let selector = '<a id="coinselectorButton" href="#" class="dropdown-toggle text-success" data-toggle="dropdown" aria-expanded="false"><i class="zmdi zmdi-more-vert"></i></a>';
    selector += '<ul class="dropdown-menu" role="menu">';
    selector += '<li><a href="javascript:void(0)" onclick="getpayouts(\'Last\')">Последние</a></li>';
    Object.keys(balance).forEach(function(coin) {
        selector += '<li><a href="javascript:void(0)" onclick="getpayouts(\''+coin+'\')">'+coin+'</a></li>';
    });
    selector += '</ul>';

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
    coin = (coin === 'Last' ? 'Последние' : coin);
    if (document.getElementById('coinselectorButton')) $('#coinselectorButton').html(coin+'<span class="caret"></span>');
}

let showPayouts = function(payouts){

    let totals = {total:0,amount:0,affilate:0};
    let tbl = payouts.map(function(res){
        totals.total += res.transaction.total_amount;
        totals.amount += res.transaction.amount;
        totals.affilate += res.transaction.amount_affiliate;
        return '<tr><td>' +res.coin + '</td><td><a href="https://etherscan.io/tx/'+res.tx+'" target="_blank">' + res.tx + '</a></td><td>'+ res.to + '</td><td>' + res.transaction.total_amount.toFixed(7) +
                '</td><td>' + res.transaction.amount.toFixed(7) +'</td><td>'+ res.transaction.amount_affiliate.toFixed(7) + '</td><td>' +
                new Date(res.time*1000).toLocaleString() + '</td></tr>';
    }).join('');
    if (tbl.length === 0) tbl = '<tr><td colspan="7" align="center"> None </td></tr>';
    else if (curcoinstat !== 'Last'){
        tbl += '<tr><td colspan="3" align="center"> ИТОГО </td><td>' + totals.total.toFixed(7) + '</td><td>' + totals.amount.toFixed(7) + '</td><td>' + totals.affilate.toFixed(7) + '</td><td></td></tr>';
    }

    $('#payoutsdata').html(tbl);

    $('#tbltrans>table').tablesaw().data( "tablesaw" ).refresh();
};

let init = function () {
    buildCoinSelector();
}();