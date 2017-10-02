function showLogin(){
    $('#register').hide();
    $('#recover').hide();
    $('#confirm').hide();
    $('#signin').show();
    $('#registerButton').show();
}

function showRegisterCenter(){
    $('#signin').hide();
    $('#recover').hide();
    $('#confirm').hide();
    $('#register').show();
    $('#registerButton').hide();
}

function tryLogin(login, password, confcode, remember){
    apiRequest('login', {login:login,password:password,confcode:confcode,remember:remember}, function(response){
        if (!response.result){
            if (response.conf) {
                $('#loginconf').val('');
                $('#confdiv').show();
            }
            alert(response.error);
        } else {
            location.assign('/user');
        }
    });
}

function checkUser(){
    apiRequest('checkUser', {}, function(response){
        if (response.result){
            location.assign('/user');
        } else {
            if (window.location.hash === '#register')
                showRegisterCenter();
            else
                showLogin();
        }
    });
}

function tryRegister(login, password, refcode){
    apiRequest('register', {login:login,password:password,refcode:refcode}, function(response){
        if (!response.result){
            alert(response.error);
        } else {
            location.assign('/user');
        }
    });
}

function apiRequest(func, data, callback){
    var httpRequest = new XMLHttpRequest();
    httpRequest.onreadystatechange = function(){
        if (httpRequest.readyState === 4 && httpRequest.responseText){
            if (httpRequest.status === 401){
                $('#password').val('');
                alert('Incorrect Password');
            }
            else{
                var response = JSON.parse(httpRequest.responseText);
                callback(response);
            }
        }
    };
    httpRequest.open('POST', '/api/user/' + func);
    httpRequest.setRequestHeader('Content-Type', 'application/json');
    var curreq = JSON.stringify(data);
    httpRequest.send(curreq);
}

$('#passwordForm').submit(function(event){
    event.preventDefault();
    tryLogin($('#login').val(), $('#password').val(), $('#loginconf').val(), $('#remember').is(':checked'));
    return false;
});

$('#registerForm').submit(function(event){
    event.preventDefault();
    var login = $('#rlogin').val();
    var password = $('#rpassword').val();
    var password2 = $('#rpassword2').val();
    var refcode = $('#refcode').val();
    if (login && password && password2 && password == password2){
        tryRegister(login, password, refcode);
    }else{
        alert("Wrong data submitted");
    }
    return false;
});

$('#registerButton').click(function(event){
    event.preventDefault();
    showRegisterCenter();
});

$('#signinButton').click(function(event){
    event.preventDefault();
    showLogin();
});

checkUser();