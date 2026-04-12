const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  }
});

const sendEmail = async (to, subject, html) => {
  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to, subject, html
    });
    console.log('Email sent to:', to);
  } catch(err) {
    console.error('Email error:', err.message);
  }
};

module.exports = { sendEmail };
