const nodemailer = require('nodemailer');

module.exports = function(logger, portalConfig){
    var _this = this;

    const transporter = portalConfig.email.enabled ? nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true, // secure:true for port 465, secure:false for port 587
        auth: {
            user: portalConfig.email.user,
            pass: portalConfig.email.pass
        }
    }) : null;

    const mailTemplate = `
        User: [@USER] <br>
        Email: [@EMAIL] <br>
        Subject: [@SUBJECT] <br>
        Info: [@INFO]
    `;

    var mailOptions = {
        from: 'cryptocompanyltd@gmail.com', // sender address
        to: 'cryptocompanyltd@gmail.com', // list of receivers
        subject: 'Feedback', // Subject line
        html: mailTemplate // html body
    };

    this.sendMail = function(params) {
        var options = {
            from: mailOptions.from,
            to: mailOptions.to,
            subject: params.subject ? params.subject : mailOptions.subject,
            html: mailTemplate.replace("[@USER]",params.name).replace("[@EMAIL]",params.email).replace("[@SUBJECT]",params.subject).replace("[@INFO]",params.info)
        };
        if (transporter)
            transporter.sendMail(options, (error, info) => {
                if (error) {
                    return logger.error('MailSender', 'MailSender', 'local', JSON.stringify(error));
                }
                logger.debug('MailSender', 'MailSender', 'local', 'Message '+info.messageId+' sent: '+info.response);
            });
    };
};