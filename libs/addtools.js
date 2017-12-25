let crypto = require('crypto');
let entityMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
};

let isBigEnough = function (value) {
    return function(element, index, array) {
        return (element >= value);
    }
};

let isSmallEnough = function (value) {
    return function(element, index, array) {
        return (element <= value);
    }
};

let parseName = function (value) {
    if (typeof value !== 'string') return ['',''];
    let clientname = value;
    let workername = '';
    if( value.indexOf("/") !== -1 )
    {
        clientname = value.substr(0, value.indexOf("/"));
        workername = value.substr(value.indexOf("/")+1,value.length);
    }
    return [clientname,workername]
};

let generateCode = function () {
    let returnCode = '';
    let base = "0123456789";
    for (i=0; i<6; ++i) {
        returnCode += base[Math.floor(Math.random() * 10)]
    }
    return returnCode
};

let generateMD5Pass = function (sText) {
    let mdRes = crypto.createHash('md5').update(sText).digest();
    let sOut = '';
    for (i=0; i<mdRes.length; ++i)
        sOut += (0xff & ~mdRes[i]).toString(16)

    return sOut
};

let hidePwd = function (sText) {
    if (!sText) return null;
    return generateMD5Pass("_Secret"+sText+"salT-")
};

let wrapMessage = function (sMessage, oParams) {
    return JSON.stringify({cmd:sMessage,params:oParams || {}})
};

let getMaxTimeIndex = function (array) {
    let returnIndex = 0;
    let minTime = array[0].time;
    for (let index = 1; index < array.length; index += 1) {
        if (array[index].time > minTime) {
            returnIndex = index;
            minTime = array[index].time
        }
    }

    return returnIndex
};

let objTimeSortFN = function (a,b) {
    if (a.time > b.time) {
        return -1;
    }
    if (a.time < b.time) {
        return 1;
    }
    return 0;
};

let objSortByStatusAndName = function (obj, label, isworking) {
    return Object.keys(obj)
        .filter(key => {
            let el = JSON.parse(obj[key]);
            return (isworking ? el.status > 0 : true) && (label ? el.Name.indexOf(label) > -1 : true)
        }).sort((a, b) => {
            let first = JSON.parse(obj[a]);
            let second = JSON.parse(obj[b]);
            return second.status - first.status !==0 ? second.status - first.status : (first.Name > second.Name ? 1 : -1);
        }).map(key => {
            return {key:key,value:obj[key]}
        })
};

let settingsArrayToMap = function (array) {
    return array.reduce(function(map, obj) {
        map[obj.name] = obj.value;
        return map;
    }, {});
};

let createFarmKey = function (name, ip) {
    return name + ' [' + ip + ']';
};

let splitFarmLabel = function (label) {
    if (label.indexOf(' [') === -1) return {name:'', ip: ''};
    else return {name: label.split(' [')[0], ip: label.split(' [')[1].substr(0, label.split(' [')[1].length-1)}
};

let escapeHtml = function (string) {
    return String(string).replace(/[&<>"'`=\/]/g, function (s) {
        return entityMap[s];
    });
};

module.exports = {
    isBigEnough: isBigEnough,
    isSmallEnough: isSmallEnough,
    parseName: parseName,
    generateCode: generateCode,
    hidePwd: hidePwd,
    wrapMessage: wrapMessage,
    getMaxTimeIndex: getMaxTimeIndex,
    objTimeSortFN: objTimeSortFN,
    settingsArrayToMap: settingsArrayToMap,
    createFarmKey: createFarmKey,
    escapeHtml: escapeHtml,
    objSortByStatusAndName: objSortByStatusAndName,
    splitFarmLabel: splitFarmLabel
};