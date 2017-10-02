
var fs = require('fs');
var path = require('path');

var async = require('async');
var watch = require('node-watch');
var redis = require('redis');

var dot = require('dot');
var express = require('express');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var compress = require('compression');

var Stratum = require('stratum-pool');
var util = require('stratum-pool/lib/util.js');

var api = require('./api.js');


module.exports = function(logger){

    dot.templateSettings.strip = false;

    var portalConfig = JSON.parse(process.env.portalConfig);
    var poolConfigs = JSON.parse(process.env.pools);

    var websiteConfig = portalConfig.website;

    var portalApi = new api(logger, portalConfig, poolConfigs);
    var portalStats = portalApi.stats;

    var logSystem = 'Website';


    var pageFiles = {
        'index.html': 'index',
        'main.html': 'main',
        'main_old.html': 'main_old',
        'authorized.html': 'authorized',
        'admin.html': 'admin',
        'home.html': '',
        'getting_started.html': 'getting_started',
        'stats.html': 'stats',
        'tbs.html': 'tbs',
        'workers.html': 'workers',
        'about.html': 'about',
        'faq.html': 'faq',
        'mining.html': 'mining',
        'miners.html': 'miners',
        'professionals.html': 'professionals',
        'start.html': 'start',
        'api.html': 'api',
        'mining_key.html': 'mining_key',
        '404.html': '404',
        '500.html': '500'
    };

    var pageTemplates = {};

    var pageProcessed = {};
    var indexesProcessed = {};

    var keyScriptTemplate = '';
    var keyScriptProcessed = '';


    var processTemplates = function(){

        for (var pageName in pageTemplates) {
            if (pageName === 'main' || pageName === 'authorized' || pageName === 'admin' || pageName === 'main_old') continue;
            pageProcessed[pageName] = pageTemplates[pageName]({
                poolsConfigs: poolConfigs,
                stats: portalStats.stats,
                portalConfig: portalConfig,
                balance: 1000
            });
            if (pageName === '404' || pageName === '500') continue;
            indexesProcessed[pageName] = pageTemplates.main({
                page: pageProcessed[pageName],
                selected: pageName,
                stats: portalStats.stats,
                poolConfigs: poolConfigs,
                portalConfig: portalConfig
            });

        }

        //logger.debug(logSystem, 'Stats', 'Website updated to latest stats');
    };

    var readPageFiles = function(files){
        async.each(files, function(fileName, callback){
            var filePath = 'website/' + (fileName === 'index.html' || fileName === 'main.html' || fileName === '404.html' || fileName === '500.html' || fileName === 'authorized.html' || fileName === 'admin.html' || fileName === 'main_old.html'? '' : 'pages/') + fileName;
            fs.readFile(filePath, 'utf8', function(err, data){
                if (err){
                    logger.error('website.js', 'website.js', 'readPageFiles');
                    return callback(err);
                }
                var pTemp = dot.template(data);
                pageTemplates[pageFiles[fileName]] = pTemp;
                callback();
            });
        }, function(err){
            if (err){
                logger.error(logSystem, 'Server', 'error reading files for creating dot templates: '+ JSON.stringify(err));
                return;
            }
            processTemplates();
        });
    };

    //If an html file was changed reload it
    watch('./website', {recursive:true}, function(eventtype, filename){
        var basename = path.basename(filename);
        if (basename in pageFiles){
            readPageFiles([basename]);
            logger.debug(logSystem, 'Server', 'Reloaded file ' + basename);
        }
    });

    portalStats.getGlobalStats(function(){

        readPageFiles(Object.keys(pageFiles));
    });

    var buildUpdatedWebsite = function(){
        portalStats.getGlobalStats(function(){
            processTemplates();

            var statData = 'data: ' + JSON.stringify(portalStats.stats) + '\n\n';
            for (var uid in portalApi.liveStatConnections){
                var res = portalApi.liveStatConnections[uid];
                res.write(statData);
            }
        });
        portalStats.dumpHistory(function(){});
    };

    setInterval(buildUpdatedWebsite, websiteConfig.stats.updateInterval * 1000);

    var buildKeyScriptPage = function(){
        async.waterfall([
            function(callback){
                var client = redis.createClient(portalConfig.redis.port, portalConfig.redis.host );
                client.hgetall('coinVersionBytes', function(err, coinBytes){
                    if (err){
                        client.quit();
                        return callback('Failed grabbing coin version bytes from redis ' + JSON.stringify(err));
                    }
                    callback(null, client, coinBytes || {});
                });
            },
            function (client, coinBytes, callback){
                var enabledCoins = Object.keys(poolConfigs).map(function(c){return c.toLowerCase()});
                var missingCoins = [];
                enabledCoins.forEach(function(c){
                    if (!(c in coinBytes))
                        missingCoins.push(c);
                });
                callback(null, client, coinBytes, missingCoins);
            },
            function(client, coinBytes, missingCoins, callback){
                var coinsForRedis = {};
                async.each(missingCoins, function(c, cback){
                    var coinInfo = (function(){
                        for (var pName in poolConfigs){
                            if (pName.toLowerCase() === c)
                                return {
                                    daemon: poolConfigs[pName].paymentProcessing.daemon,
                                    address: poolConfigs[pName].address
                                }
                        }
                    })();
                    var daemon = new Stratum.daemon.interface([coinInfo.daemon], function(severity, message){
                        logger[severity](logSystem, c, message);
                    });

/*                    daemon.cmd('dumpprivkey', [coinInfo.address], function(result){
                        if (result[0].error){
                            logger.error(logSystem, c, 'Could not dumpprivkey for ' + c + ' ' + JSON.stringify(result[0].error));
                            cback();
                            return;
                        }

                        var vBytePub = util.getVersionByte(coinInfo.address)[0];
                        var vBytePriv = util.getVersionByte(result[0].response)[0];

                        coinBytes[c] = vBytePub.toString() + ',' + vBytePriv.toString();
                        coinsForRedis[c] = coinBytes[c];
                        cback();
                    });
*/		    
		    
                }, function(err){
                    callback(null, client, coinBytes, coinsForRedis);
                });
            },
            function(client, coinBytes, coinsForRedis, callback){
                if (Object.keys(coinsForRedis).length > 0){
                    client.hmset('coinVersionBytes', coinsForRedis, function(err){
                        if (err)
                            logger.error(logSystem, 'Init', 'Failed inserting coin byte version into redis ' + JSON.stringify(err));
                        client.quit();
                    });
                }
                else{
                    client.quit();
                }
                callback(null, coinBytes);
            }
        ], function(err, coinBytes){
            if (err){
                logger.error(logSystem, 'Init', err);
                return;
            }
            try{
                keyScriptTemplate = dot.template(fs.readFileSync('website/key.html', {encoding: 'utf8'}));
                keyScriptProcessed = keyScriptTemplate({coins: coinBytes});
            }
            catch(e){
                logger.error(logSystem, 'Init', 'Failed to read key.html file');
            }
        });

    };
    buildKeyScriptPage();

    var getPage = function(pageId){
        if (pageId in pageProcessed){
            var requestedPage = pageProcessed[pageId];
            return requestedPage;
        }
    };

    var route = function(req, res, next){
        var pageId = req.params.page || '';

        if (pageId in indexesProcessed){
            res.header('Content-Type', 'text/html');
            res.end(indexesProcessed[pageId]);
        }
        else
            next();

    };

    var buildUserStat = function( userid, callbackfx )
    {
        var filePath = 'website/pages/userstat.html';
        var pTemp ='Empty';
        fs.readFile(filePath, 'utf8', function(err, data){
                pTemp = dot.template(data);
                callbackfx( pTemp);
        });
    };

    var buildPayoutStat = function( coin, callbackfx )
    {
        var filePath = 'website/pages/payout.html';
        var pTemp ='Empty';
        fs.readFile(filePath, 'utf8', function(err, data){
            pTemp = dot.template(data);
            callbackfx( pTemp);
        });
    };

    var buildAdminPage = function(  callbackfx )
    {
        var filePath = 'website/pages/admauth.html';
        var pTemp ='Empty';
        fs.readFile(filePath, 'utf8', function(err, data){
            pTemp = dot.template(data);
            callbackfx( pTemp);
        });
    };

    var buildAdminSummaryPage = function(  callbackfx )
    {
        var filePath = 'website/pages/admsummary.html';
        var pTemp ='Empty';
        fs.readFile(filePath, 'utf8', function(err, data){
            pTemp = dot.template(data);
            callbackfx( pTemp);
        });
    };

    var buildUserPage = function(  callbackfx )
    {
        var filePath = 'website/pages/user.html';
        var pTemp ='Empty';
        fs.readFile(filePath, 'utf8', function(err, data){
            pTemp = dot.template(data);
            callbackfx( pTemp);
        });
    };

    var buildAuthPage = function( callbackfx )
    {
        var filePath = 'website/pages/auth.html';
        var pTemp ='Empty';
        fs.readFile(filePath, 'utf8', function(err, data){
            pTemp = dot.template(data);
            callbackfx( pTemp);
        });
    };

    var buildFarmsPage = function(  callbackfx )
    {
        var filePath = 'website/pages/farms.html';
        var pTemp ='Empty';
        fs.readFile(filePath, 'utf8', function(err, data){
            pTemp = dot.template(data);
            callbackfx( pTemp);
        });
    };

    var buildBalancePage = function(  callbackfx )
    {
        var filePath = 'website/pages/balance.html';
        var pTemp ='Empty';
        fs.readFile(filePath, 'utf8', function(err, data){
            pTemp = dot.template(data);
            callbackfx( pTemp);
        });
    };

    var buildGraphsPage = function(  callbackfx )
    {
        var filePath = 'website/pages/graphs.html';
        var pTemp ='Empty';
        fs.readFile(filePath, 'utf8', function(err, data){
            pTemp = dot.template(data);
            callbackfx( pTemp);
        });
    };

    var buildWalletsPage = function(  callbackfx )
    {
        var filePath = 'website/pages/wallets.html';
        var pTemp ='Empty';
        fs.readFile(filePath, 'utf8', function(err, data){
            pTemp = dot.template(data);
            callbackfx( pTemp);
        });
    };

    var buildProfilePage = function(  callbackfx )
    {
        var filePath = 'website/pages/profile.html';
        var pTemp ='Empty';
        fs.readFile(filePath, 'utf8', function(err, data){
            pTemp = dot.template(data);
            callbackfx( pTemp);
        });
    };

    var buildPayoutPage = function(  callbackfx )
    {
        var filePath = 'website/pages/payouts.html';
        var pTemp ='Empty';
        fs.readFile(filePath, 'utf8', function(err, data){
            pTemp = dot.template(data);
            callbackfx( pTemp);
        });
    };

    var buildAdmUserPage = function( callbackfx )
    {
        var filePath = 'website/pages/admusers.html';
        var pTemp ='Empty';
        fs.readFile(filePath, 'utf8', function(err, data){
            pTemp = dot.template(data);
            callbackfx( pTemp);
        });
    };

    var buildOldIndexPage = function(  callbackfx )
    {
        var filePath = 'website/pages/home_old.html';
        var pTemp ='Empty';
        fs.readFile(filePath, 'utf8', function(err, data){
            pTemp = dot.template(data);
            callbackfx( pTemp);
        });
    };

    var app = express();


    app.use(bodyParser.json());
    app.use(cookieParser());

    app.get('/get_page', function(req, res, next){
        var requestedPage = getPage(req.query.id);
        if (requestedPage){
            res.end(requestedPage);
            return;
        }
        next();
    });

    app.get('/key.html', function(req, res, next){
        res.end(keyScriptProcessed);
    });
    app.get('/userstat/:wallet', function(req, res, next){
        var wallet = req.params.wallet;
        res.header('Content-Type', 'text/html');
        buildUserStat(wallet, function(data){
            res.end(pageTemplates.main({
                    page: data({
                            userid : wallet,
                            stats: portalStats.stats,
                            poolConfigs: poolConfigs,
                            portalConfig: portalConfig
                        }),
                    selected: 'UserStat',
                    stats: portalStats.stats,
                    poolConfigs: poolConfigs,
                    portalConfig: portalConfig
                }
                ));
        });
    });

    app.get('/admin', function(req, res, next){
        res.header('Content-Type', 'text/html');
        buildAdminPage( function(data) {
            portalStats.getLiveStats( function (err, results) {
                var liveConnections = results;
                res.end(pageTemplates.index({
                        page: data({
                            liveConnections : liveConnections,
                            stats: portalStats.stats,
                            poolConfigs: poolConfigs,
                            portalConfig: portalConfig
                        }),
                        selected: 'Admin',
                        stats: portalStats.stats,
                        poolConfigs: poolConfigs,
                        portalConfig: portalConfig
                    }
                ));
            });
        });
    });

    app.get('/admin/summary', function(req, res, next){
        res.header('Content-Type', 'text/html');
        buildAdminSummaryPage( function(data) {
            res.end(pageTemplates.admin({
                page: data({
                    stats: portalStats.stats,
                    poolConfigs: poolConfigs,
                    portalConfig: portalConfig
                }),
                stats: portalStats.stats,
                poolConfigs: poolConfigs,
                portalConfig: portalConfig
            }));
        });
    });

    app.get('/admin/payouts', function(req, res, next){
        res.header('Content-Type', 'text/html');
        buildPayoutPage( function(data) {
            res.end(pageTemplates.admin({
                page: data({
                    stats: portalStats.stats,
                    poolConfigs: poolConfigs,
                    portalConfig: portalConfig
                }),
                selected: 'Admin',
                stats: portalStats.stats,
                poolConfigs: poolConfigs,
                portalConfig: portalConfig}));
        });
    });

    app.get('/admin/user/:id*?', function(req, res, next){
        var user_id = req.params.id || '';
        res.header('Content-Type', 'text/html');
        portalStats.getUser(user_id, function(err, results) {
            if (user_id && !results.user)
                next();
            else {
                var resultData = results;
                buildAdmUserPage(function (data) {
                    res.end(pageTemplates.admin({
                        page: data({
                            stats: portalStats.stats,
                            poolConfigs: poolConfigs,
                            portalConfig: portalConfig,
                            user: resultData.user
                        }),
                        stats: portalStats.stats,
                        poolConfigs: poolConfigs,
                        portalConfig: portalConfig
                    }));
                });
            }
        });
    });

    app.get('/auth', function(req, res, next) {
        res.header('Content-Type', 'text/html');
        var refcode = req.query.refcode || '';
        buildAuthPage(function (data) {
            res.end(pageTemplates.index({
                page: data({
                    stats: portalStats.stats,
                    poolConfigs: poolConfigs,
                    portalConfig: portalConfig,
                    refcode: refcode
                }),
                selected: 'user',
                stats: portalStats.stats,
                poolConfigs: poolConfigs,
                portalConfig: portalConfig}));
        });
    });

    app.get('/user', function(req, res, next) {
        res.header('Content-Type', 'text/html');
        buildUserPage(function (data) {
                res.end(pageTemplates.authorized({
                    page: data({
                        stats: portalStats.stats,
                        poolConfigs: poolConfigs,
                        portalConfig: portalConfig
                    }),
                    selected: 'user',
                    stats: portalStats.stats,
                    poolConfigs: poolConfigs,
                    portalConfig: portalConfig}));
        });
    });

    app.get('/user/farms', function(req, res, next) {
        res.header('Content-Type', 'text/html');
        buildFarmsPage(function (data) {
            res.end(pageTemplates.authorized({
                page: data({
                    stats: portalStats.stats,
                    poolConfigs: poolConfigs,
                    portalConfig: portalConfig
                }),
                selected: 'user',
                stats: portalStats.stats,
                poolConfigs: poolConfigs,
                portalConfig: portalConfig}));
        });
    });

    app.get('/user/balance', function(req, res, next) {
        res.header('Content-Type', 'text/html');
        buildBalancePage(function (data) {
            res.end(pageTemplates.authorized({
                page: data({
                    stats: portalStats.stats,
                    poolConfigs: poolConfigs,
                    portalConfig: portalConfig
                }),
                selected: 'user',
                stats: portalStats.stats,
                poolConfigs: poolConfigs,
                portalConfig: portalConfig}));
        });
    });

    app.get('/user/wallets', function(req, res, next) {
        res.header('Content-Type', 'text/html');
        buildWalletsPage(function (data) {
            res.end(pageTemplates.authorized({
                page: data({
                    stats: portalStats.stats,
                    poolConfigs: poolConfigs,
                    portalConfig: portalConfig,
                    minPayments: portalConfig
                }),
                selected: 'user',
                stats: portalStats.stats,
                poolConfigs: poolConfigs,
                portalConfig: portalConfig}));
        });
    });

    app.get('/user/graphs', function(req, res, next) {
        res.header('Content-Type', 'text/html');
        buildGraphsPage(function (data) {
            res.end(pageTemplates.authorized({
                page: data({
                    stats: portalStats.stats,
                    poolConfigs: poolConfigs,
                    portalConfig: portalConfig
                }),
                selected: 'user',
                stats: portalStats.stats,
                poolConfigs: poolConfigs,
                portalConfig: portalConfig}));
        });
    });

    app.get('/user/profile', function(req, res, next) {
        res.header('Content-Type', 'text/html');
        buildProfilePage(function (data) {
            res.end(pageTemplates.authorized({
                page: data({
                    stats: portalStats.stats,
                    poolConfigs: poolConfigs,
                    portalConfig: portalConfig
                }),
                selected: 'user',
                stats: portalStats.stats,
                poolConfigs: poolConfigs,
                portalConfig: portalConfig}));
        });
    });

    app.get('/payout/:coin', function(req, res, next){
        var coin = req.params.coin;
        res.header('Content-Type', 'text/html');
        buildPayoutStat(coin, function(data){
            portalStats.getPayoutStats(coin, function(err, results) {
                var payout = results;
                res.end(pageTemplates.main({
                        page: data({
                            coin: coin,
                            payout: payout
                        }),
                        selected: 'Payout',
                        stats: portalStats.stats,
                        poolConfigs: poolConfigs,
                        portalConfig: portalConfig
                    }
                ));
            });
        });
    });

    app.get('/old', function(req, res, next){
        res.header('Content-Type', 'text/html');
        buildOldIndexPage( function(data) {
            res.end(pageTemplates.main_old({
                    page: data({
                        stats: portalStats.stats,
                        poolConfigs: poolConfigs,
                        portalConfig: portalConfig
                    }),
                    selected: 'None',
                    stats: portalStats.stats,
                    poolConfigs: poolConfigs,
                    portalConfig: portalConfig
                }
            ));
        });
    });

    app.get('/:page/', route);
    app.get('/', route);

    app.post('/api/feedback', function(req, res, next){
        req.params.method = 'feedback';
        portalApi.handleApiRequest(req, res, next);
    });

    app.get('/api/:method', function(req, res, next){
        portalApi.handleApiRequest(req, res, next);
    });

    app.post('/api/admin/:method', function(req, res, next){
        portalApi.handleAdminApiRequest(req, res, next);
    });

    app.post('/api/payout/:method', function(req, res, next){
        portalApi.handleAdminApiRequest(req, res, next);
    });

    app.post('/api/user/:method', function(req, res, next){
        logger.debug(logSystem, 'Website', 'Post request on ' + req.originalUrl);
        portalApi.handleUserApiRequest(req, res, next);
    });

    app.post('/api/sys/:method', function(req, res, next){
        portalApi.handleSystemApiRequest(req, res, next);
    });

    app.use(compress());
    app.use('/static', express.static('website/static'));
    app.use('/css', express.static('website/css'));
    app.use('/fonts', express.static('website/fonts'));
    app.use('/images', express.static('website/images'));
    app.use('/js', express.static('website/js'));
    app.use('/favicon.png', express.static('website/favicon.png'));

    app.use(function(err, req, res, next){
        console.error(err.stack);
        res.status(500);

        // respond with html page
        if (req.accepts('html')) {
            res.header('Content-Type', 'text/html');
            res.end(pageProcessed['500']);
            return;
        }

        // respond with json
        if (req.accepts('json')) {
            res.send({ error: 'Something broke!' });
            return;
        }

        // default to plain-text. send()
        res.type('txt').send('Something broke!');
    });

    app.get('*', function(req, res){
        res.status(404);

        // respond with html page
        if (req.accepts('html')) {
            res.header('Content-Type', 'text/html');
            res.end(pageProcessed['404']);
            return;
        }

        // respond with json
        if (req.accepts('json')) {
            res.send({ error: 'Not found' });
            return;
        }

        // default to plain-text. send()
        res.type('txt').send('Not found');
    });

    try {
        app.listen(portalConfig.website.port, portalConfig.website.host, function () {
            logger.debug(logSystem, 'Server', 'Website started on ' + portalConfig.website.host + ':' + portalConfig.website.port);
        });
    }
    catch(e){
        logger.error(logSystem, 'Server', 'Could not start website on ' + portalConfig.website.host + ':' + portalConfig.website.port
            +  ' - its either in use or you do not have permission');
    }


};
