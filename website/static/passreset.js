function tryReset(reccode, password){
    apiRequest('reset', {password:password,reccode:reccode}, function(response){
        if (!response.result){
            alert(response.error);
        } else {
            location.assign('/user');
        }
    });
}

function apiRequest(func, data, callback){
    let httpRequest = new XMLHttpRequest();
    httpRequest.onreadystatechange = function(){
        if (httpRequest.readyState === 4 && httpRequest.responseText){
            let response = JSON.parse(httpRequest.responseText);
            callback(response);
        }
    };
    httpRequest.open('POST', '/api/user/' + func);
    httpRequest.setRequestHeader('Content-Type', 'application/json');
    let curreq = JSON.stringify(data);
    httpRequest.send(curreq);
}

$('#resetForm').submit(function(event){
    event.preventDefault();
    let password = $('#rpassword').val();
    let password2 = $('#rpassword2').val();
    let reccode = $('#reccode').val();
    if (reccode && password && password2 && password === password2){
        tryReset(reccode, password);
    } else {
        alert("Wrong data submitted");
    }
    return false;
});