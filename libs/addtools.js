var crypto = require('crypto');
var isBigEnough = function (value) {
    return function(element, index, array) {
        return (element >= value);
    }
};
var isSmallEnough = function (value) {
    return function(element, index, array) {
        return (element <= value);
    }
};

var parseName = function (value) {
    if (typeof value !== 'string') return ['',''];
    var clientname = value;
    var workername = '';
    if( value.indexOf("/") !== -1 )
    {
        clientname = value.substr(0, value.indexOf("/"));
        workername = value.substr(value.indexOf("/")+1,value.length);
    }
    return [clientname,workername]
};

var generateCode = function () {
    var returnCode = '';
    var base = "0123456789";
    for (i=0; i<6; ++i) {
        returnCode += base[Math.floor(Math.random() * 10)]
    }
    return returnCode
};

var generateMD5Pass = function (sText) {
    var mdRes = crypto.createHash('md5').update(sText).digest();
    var sOut = '';
    for (i=0; i<mdRes.length; ++i)
        sOut += (0xff & ~mdRes[i]).toString(16)

    return sOut
};

var hidePwd = function (sText) {
    if (!sText) return null;
    return generateMD5Pass("_Secret"+sText+"salT-")
};

var wrapMessage = function (sMessage, oParams) {
    return JSON.stringify({cmd:sMessage,params:oParams || {}})
};

var getMaxTimeIndex = function (array) {
    var returnIndex = 0;
    var minTime = array[0].time;
    for (var index = 1; index < array.length; index += 1) {
        if (array[index].time > minTime) {
            returnIndex = index;
            minTime = array[index].time
        }
    }

    return returnIndex
};

var objTimeSortFN = function (a,b) {
    if (a.time > b.time) {
        return -1;
    }
    if (a.time < b.time) {
        return 1;
    }
    return 0;
};

var settingsArrayToMap = function (array) {
    var result = array.reduce(function(map, obj) {
        map[obj.name] = obj.value;
        return map;
    }, {});
    return result;
};

var createFarmKey = function (name, ip) {
    return name + ' [' + ip + ']';
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
    createFarmKey: createFarmKey
};