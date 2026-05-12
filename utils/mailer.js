const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 465,
  secure: (process.env.SMTP_PORT || '465') === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendMail = (options) =>
  transporter.sendMail({
    from: process.env.SMTP_FROM || `"Nimbus CRM" <${process.env.SMTP_USER}>`,
    ...options,
  });

module.exports = { sendMail };
