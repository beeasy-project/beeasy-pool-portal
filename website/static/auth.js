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

function showRecover(){
    $('#signin').hide();
    $('#confirm').hide();
    $('#register').hide();
    $('#recover').show();
    $('#registerButton').hide();
}

function showConfirm(){
    $('#signin').hide();
    $('#register').hide();
    $('#recover').hide();
    $('#confirm').show();
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
            switch (window.location.hash){
                case '#register':
                    showRegisterCenter();
                    break;
                case '#recover':
                    showRecover();
                    break;
                case '#confirm':
                    showConfirm();
                    break;
                default:
                    showLogin();
            }
        }
    });
}

function tryRegister(login, password, refcode){
    apiRequest('register', {login:login,password:password,refcode:refcode}, function(response){
        if (!response.result){
            alert(response.error);
        } else {
            location.assign('/user/software');
        }
    });
}

function tryRecover(login){
    apiRequest('recover', {login:login}, function(response){
        if (!response.result){
            alert(response.error);
        } else {
            showConfirm();
        }
    });
}

function apiRequest(func, data, callback){
    let httpRequest = new XMLHttpRequest();
    httpRequest.onreadystatechange = function(){
        if (httpRequest.readyState === 4 && httpRequest.responseText){
            if (httpRequest.status === 401){
                $('#password').val('');
                alert('Incorrect Password');
            }
            else{
                let response = JSON.parse(httpRequest.responseText);
                callback(response);
            }
        }
    };
    httpRequest.open('POST', '/api/user/' + func);
    httpRequest.setRequestHeader('Content-Type', 'application/json');
    let curreq = JSON.stringify(data);
    httpRequest.send(curreq);
}

$('#passwordForm').submit(function(event){
    event.preventDefault();
    tryLogin($('#login').val(), $('#password').val(), $('#loginconf').val(), $('#remember').is(':checked'));
    return false;
});

$('#registerForm').submit(function(event){
    event.preventDefault();
    let login = $('#rlogin').val();
    let password = $('#rpassword').val();
    let password2 = $('#rpassword2').val();
    let refcode = $('#refcode').val();
    if (login && password && password2 && password === password2){
        tryRegister(login, password, refcode);
    }else{
        alert("Wrong data submitted");
    }
    return false;
});

$('#recoverForm').submit(function(event){
    event.preventDefault();
    let login = $('#reclogin').val();
    if (login){
        tryRecover(login);
    }else{
        alert("Не все обязательные поля заполнены");
    }
    return false;
});

$('#registerButton').click(function(event){
    event.preventDefault();
    showRegisterCenter();
});

$('#signinButton, #signinButton2, #signinButton3').click(function(event){
    event.preventDefault();
    showLogin();
});

$('#recoverButton').click(function(event){
    event.preventDefault();
    showRecover();
});

checkUser();