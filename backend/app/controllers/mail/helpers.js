// helpers.js
const nodemailer = require('nodemailer');
const { loadConfig } = require('../../utils/config-loader');
const { log } = require('../../utils/Logger');

let smtpConfig;
try {
  smtpConfig = loadConfig('mail');
} catch (e) {
  log.error.error(`Failed to load SMTP configuration: ${e.message}`);
}

/**
 * Create a nodemailer transporter with SMTP configuration
 * @returns {Object} Nodemailer transporter
 */
const createTransporter = () =>
  nodemailer.createTransport({
    host: smtpConfig.smtp_connect.host.value,
    port: smtpConfig.smtp_connect.port.value,
    secure: smtpConfig.smtp_connect.secure.value,
    auth: {
      user: smtpConfig.smtp_auth.user.value,
      pass: smtpConfig.smtp_auth.password.value,
    },
    debug: true,
    logger: true,
  });

module.exports = {
  createTransporter,
  smtpConfig,
};
