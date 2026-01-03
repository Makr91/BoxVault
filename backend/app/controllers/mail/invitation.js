// invitation.js
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

const sendInvitationMail = async (
  email,
  token,
  organizationName,
  expirationTime,
  locale = 'en'
) => {
  try {
    const transporter = createTransporter();

    const frontendUrl = appConfig.boxvault.origin.value;
    const invitationLink = `${frontendUrl}/register?token=${token}&organization=${organizationName}`;
    const expirationDate = new Date(expirationTime).toLocaleString();

    const mailOptions = {
      from: smtpConfig.smtp_settings.from.value,
      to: email,
      subject: t('mail.invitationSubject', locale, { organizationName }),
      html: `
        <h1>${t('mail.invitationTitle', locale, { organizationName })}</h1>
        <p>${t('mail.invitationBody', locale)}</p>
        <a href="${invitationLink}">${t('mail.invitationButton', locale)}</a>
        <p>${t('mail.invitationExpiry', locale, { expirationDate })}</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    return invitationLink;
  } catch (error) {
    log.error.error('Error sending invitation email:', error);
    throw error;
  }
};

module.exports = {
  sendInvitationMail,
};
