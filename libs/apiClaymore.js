var net = require('net');
var crypto = require('crypto');
var events = require('events');


function DaemonInterface(ip, port, logger) {

    var _this = this;
    var socket;
    this._ip = ip;
    this._port = port;

    logger = logger || function (severity, message) {
            console.log(severity + ': ' + message);
        };

    function init() {
        Connect();
        isOnline(function (online) {
            if (online)
                _this.emit('online');
        });
    };

    function isOnline(callback) {
        /*        cmd('getinfo', [], function (results) {
         var allOnline = results.every(function (result) {
         return !results.error;
         });
         callback(allOnline);
         if (!allOnline)
         _this.emit('connectionFailed', results);
         });*/
    }




    function Connect() {
        var dataBuffer = '';

        socket = net.connect({
            host: _this._ip,
            port: _this._port
        }, function () {

        });
        socket.on('close', function () {
            _this.emit('disconnected');
            logger.error('claymore', 'proxy','Socket disconnected');
            Connect();
        });
        socket.on('error', function (e) {
            if (e.code === 'ECONNREFUSED') {
                validConnectionConfig = false;
                _this.emit('connectionFailed');
            }
            else
                _this.emit('socketError', e);
        });
        socket.on('data', function (d) {
            dataBuffer += d;
            if (Buffer.byteLength(dataBuffer, 'utf8') > 10240) { //10KB
                dataBuffer = '';
                _this.emit('socketFlooded');
                socket.destroy();
                return;
            }
            if (dataBuffer.indexOf('\n') === -1) {
                dataBuffer = dataBuffer + '\n';
            }
                var messages = dataBuffer.split('\n');
                var incomplete = dataBuffer.slice(-1) === '\n' ? '' : messages.pop();
                messages.forEach(function (message) {
                    if (message === '') return;
                    var messageJson;
                    try {
                        messageJson = JSON.parse(message);
                    } catch (e) {
                        if (options.tcpProxyProtocol !== true || d.indexOf('PROXY') !== 0) {
                            _this.emit('malformedMessage', message);
                            socket.destroy();
                        }
                        return;
                    }
                    if (messageJson) {
                        handleMessage(messageJson);
                    }
                });
                dataBuffer = incomplete;

        });
    }


    function handleMessage(command) {
        switch(command.id)
        {
            case 0:
                var totalhashrate = command.result[2].split(';')[0];
                var hashrate = command.result[3].split(';');
                var temperature_speed = command.result[6].split(';')
                var temperature=[];
                var speed=[];
                for( var i = 0 ; i < temperature_speed.length ; i +=2)
                {
                    temperature.push(temperature_speed[i]);
                    speed.push(temperature_speed[i+1]);
                }
                var cores = hashrate.length;
                _this.emit("stat", totalhashrate, cores, hashrate, temperature, speed);
        }

    }

    function SendStatRequest( callback, params ) {
        sendJson({
            id: 0,
            jsonrpc : "2.0",
            method: "miner_getstat1"
        });
    }

    function sendJson() {
        var response = '';
        for (var i = 0; i < arguments.length; i++) {
            response += JSON.stringify(arguments[i]) + '\n';
        }
        socket.write(response);
    }


    function batchCmd(cmdArray, callback) {

        var requestJson = [];

        for (var i = 0; i < cmdArray.length; i++) {
            requestJson.push({
                method: cmdArray[i][0],
                params: cmdArray[i][1],
                id: Date.now() + Math.floor(Math.random() * 10) + i
            });
        }

        var serializedRequest = JSON.stringify(requestJson);

        sendJson(serializedRequest);

    }

    function cmd(method, params, callback, streamResults, returnRawData) {
        var requestJson = {
            id: Date.now() + Math.floor(Math.random() * 10),
            jsonrpc : "2.0",
            method: method,
            params: params
        };
        //var serializedRequest = JSON.stringify(requestJson);

        //sendJson(serializedRequest);
        sendJson(requestJson);
    }


    this.init = init;
    this.isOnline = isOnline;
    this.cmd = cmd;
    this.batchCmd = batchCmd;
    this.stat = SendStatRequest;


};

DaemonInterface.prototype.__proto__ = events.EventEmitter.prototype;

exports.interface = DaemonInterface;