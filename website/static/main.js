$(function(){

    let hotSwap = function(page, pushSate){
        if (pushSate) history.pushState(null, null, '/' + page);
        $('.pure-menu-selected').removeClass('pure-menu-selected');
        $('a[href="/' + page + '"]').parent().addClass('pure-menu-selected');
        $.get("/get_page", {id: page}, function(data){
            $('main').html(data);
        }, 'html')
    };

    $('.hot-swapper').click(function(event){
        if (event.which !== 1) return;
        let pageId = $(this).attr('href').slice(1);
        hotSwap(pageId, true);
        event.preventDefault();
        return false;
    });

    window.addEventListener('load', function() {
        setTimeout(function() {
            window.addEventListener("popstate", function(e) {
//                alert("hello");
                hotSwap(location.pathname.slice(1));
            });
        }, 0);
    });

    if ("EventSource" in window) {
        window.statsSource = new EventSource("/api/live_stats");
    }

});

function checkSwitchery(el, isChecked){
    el.checked = isChecked;
    if (typeof Event === 'function' || !document.fireEvent) {
        let event = document.createEvent('HTMLEvents');
        event.initEvent('change', true, true);
        el.dispatchEvent(event);
    } else {
        el.fireEvent('onchange');
    }
}

function formatIP(ip){
    let IP = ip;
    if( IP.indexOf("::ffff:") !== -1 ) IP = IP.substr(7,IP.length);
    return IP;
}

function paginate(el, count, page, clickCallback){
    el.twbsPagination('destroy');
    el.twbsPagination({
        totalPages: Math.ceil(count/10),
        visiblePages: 5,
        startPage: page,
        initiateStartPageClick: false,
        onPageClick: function (event, page) {
            clickCallback(page);
        }
    });
}

function secondsToHms(d) {
    d = Number(d);
    let h = Math.floor(d / 3600);
    let m = Math.floor(d % 3600 / 60);
    let s = Math.floor(d % 3600 % 60);

    return ('0' + h).slice(-2) + ":" + ('0' + m).slice(-2) + ":" + ('0' + s).slice(-2);
}

function getReadableHashRateString(hashrate){
    let i = -1;
    let byteUnits = [ ' KH', ' MH', ' GH', ' TH', ' PH' ];
    do {
        hashrate = hashrate / 1024;
        i++;
    } while (hashrate > 1024);
    hashrate = Math.round(hashrate * 100) / 100;
    return hashrate + byteUnits[i];
}

function getReadableMHashRateString(hashrate){
    let i = -1;
    do {
        hashrate = hashrate / 1024;
        i++;
    } while (i < 1);
    hashrate = Math.round(hashrate * 100) / 100;
    return hashrate;
}

function formatHRString(_str){
    let hrArr = _str.split(',');
    let mediane = hrArr.reduce((a, b) => a + (parseFloat(b) || 0), 0) / hrArr.length;
    return hrArr.map( hrStr => {
        let parsedStr = parseFloat(hrStr) || 0;
        return wrapstatdata(getReadableMHashRateString(parsedStr * 1024), hrArr.length > 2 ? parsedStr * 100 / mediane < 85 : false)
    }).join(", ");
}

function formatTempString(_str){
    let hrArr = _str.split(',');
    let mediane = hrArr.reduce((a, b) => a + parseFloat(b), 0) / hrArr.length;
    return hrArr.map( hrStr => {
        let parsedStr = parseFloat(hrStr);
        return wrapstatdata(parsedStr, parsedStr > 87 ? true : (hrArr.length > 2 ? parsedStr * 100 / mediane < 65 || parsedStr * 100 / mediane > 155: false))
    }).join(", ");
}

function formatFanString(_str){
    let hrArr = _str.split(',');
    let mediane = hrArr.reduce((a, b) => a + parseFloat(b), 0) / hrArr.length;
    return hrArr.map( hrStr => {
        let parsedStr = parseFloat(hrStr);
        return wrapstatdata(parsedStr, parsedStr < 10 ? true : (hrArr.length > 2 ? parsedStr * 100 / mediane < 65 || parsedStr * 100 / mediane > 155 : false))
    }).join(", ");
}

function wrapstatdata(_str, isErr){
    return '<span' + (isErr ? ' style="color:red"' : '') + '>' + _str + '</span>'
}

function createFarmKey(name, ip) {
    return name + ' [' + ip + ']';
}

function wrapForTextClip(_content, _title) {
    let title = _title || '';
    return '<div class="text-overflow-dynamic-container" title="'+ title +'"><div class="text-overflow-dynamic-ellipsis">' + _content + '</div></div>';
}