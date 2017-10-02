function checkUser(){
    apiRequest('checkUser', {}, function(response){
        if (response.result){
            location.assign('/admin/summary');
        }
    });
}

function tryLogin(login, password, remember){
    apiRequest('login', {login:login,password:password,remember:remember}, function(response){
        if (!response.result){
            alert(response.error);
        } else {
            location.assign('/admin/summary');
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
    httpRequest.open('POST', '/api/admin/' + func);
    httpRequest.setRequestHeader('Content-Type', 'application/json');
    httpRequest.send(JSON.stringify(data));
}

$('#passwordForm').submit(function(event){
    event.preventDefault();
    tryLogin($('#name').val(), $('#password').val(), $('#remember').is(':checked'));
    return false;
});

checkUser();