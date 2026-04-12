const axios = require('axios');

const sendEmail = async (to, subject, html) => {
  try {
    await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { name: 'NovaTech BD', email: 'jisbusinessbd@gmail.com' },
      to: [{ email: to }],
      subject,
      htmlContent: html
    }, {
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    console.log('Email sent to:', to);
  } catch(err) {
    console.error('Email error:', err.response?.data || err.message);
  }
};

module.exports = { sendEmail };
