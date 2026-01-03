// verification.js
const nodemailer = require('nodemailer');
const { loadConfig } = require('../../utils/config-loader');
const { log } = require('../../utils/Logger');
const { createTransporter, smtpConfig } = require('./helpers');
const { t } = require('../../config/i18n');

let appConfig;
try {
  appConfig = loadConfig('app');
} catch (e) {
  log.error.error(`Failed to load app configuration: ${e.message}`);
}

const sendVerificationMail = async (user, verificationToken, expirationTime, locale = 'en') => {
  log.app.info('Attempting to send verification email...');
  log.app.info('SMTP Configuration:', JSON.stringify(smtpConfig, null, 2));

  try {
    log.app.info('Creating transporter...');
    const transporter = createTransporter();

    log.app.info('Transporter created successfully');

    const frontendUrl = appConfig.boxvault.origin.value;
    // Change this line to point to the profile page
    const verificationLink = `${frontendUrl}/profile?token=${verificationToken}`;
    const expirationDate = new Date(expirationTime).toLocaleString();

    log.app.info('Preparing email...');
    const mailOptions = {
      from: smtpConfig.smtp_settings.from.value,
      to: user.email,
      subject: t('mail.verificationSubject', locale),
      html: `
        <h1>${t('mail.verificationTitle', locale)}</h1>
        <p>${t('mail.verificationBody', locale)}</p>
        <a href="${verificationLink}">${t('mail.verificationButton', locale)}</a>
        <p>${t('mail.verificationExpiry', locale, { expirationDate })}</p>
      `,
    };
    log.app.info('Mail options:', JSON.stringify(mailOptions, null, 2));

    log.app.info('Sending email...');
    const info = await transporter.sendMail(mailOptions);

    log.app.info('Verification email sent: %s', info.messageId);
    log.app.info('Preview URL: %s', nodemailer.getTestMessageUrl(info));

    return info;
  } catch (error) {
    log.error.error('Error sending verification email:', error);
    log.error.error('Error stack:', error.stack);
    if (error.response) {
      log.error.error('SMTP Response:', error.response);
    }
    throw error; // Re-throw the error so it can be handled by the caller
  }
};

module.exports = {
  sendVerificationMail,
};
