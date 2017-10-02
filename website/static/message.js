function trySendMessage(name, email, subject, info)
{
    apiRequest('feedback', {name:name, email:email, subject:subject, info:info}, function(response){
        $('#name').val('');
        $('#email').val('');
        $('#subject').val('');
        $('#exampletextarea').val('');
        alert('Cообщение отправлено.')
    });
}

function apiRequest(func, data, callback){
    var httpRequest = new XMLHttpRequest();
    httpRequest.onreadystatechange = function(){
        if (httpRequest.readyState === 4 && httpRequest.responseText){
            if (httpRequest.status === 401){
                alert('Error');
            }
            else{
                var response = JSON.parse(httpRequest.responseText);
                callback(response);
            }
        }
    };
    httpRequest.open('POST', '/api/' + func);
    httpRequest.setRequestHeader('Content-Type', 'application/json');
    var curreq = JSON.stringify(data);
    httpRequest.send(curreq);
}

$('#messageform').submit( function(event){
    event.preventDefault();
    trySendMessage( $('#name').val(), $('#email').val(), $('#subject').val(), $('#exampletextarea').val());
});
