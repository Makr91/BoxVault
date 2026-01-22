// invitation.js
import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import { createTransporter, getSmtpConfig } from './helpers.js';
import { t } from '../../config/i18n.js';

export const sendInvitationMail = async (
  email,
  token,
  organizationName,
  expirationTime,
  locale = 'en'
) => {
  let appConfig;
  // Ensure config is loaded
  try {
    appConfig = loadConfig('app');
  } catch (e) {
    log.error.error('Failed to load app config:', e);
    throw e; // Re-throw to be caught by the outer try-catch
  }

  const smtpConfig = getSmtpConfig();

  if (!smtpConfig || !smtpConfig.smtp_settings || !smtpConfig.smtp_settings.from) {
    const err = new Error('SMTP configuration is missing or invalid.');
    log.error.error('Error preparing invitation email:', err);
    throw err;
  }

  try {
    const transporter = createTransporter();
    const frontendUrl = appConfig?.boxvault?.origin?.value || 'http://localhost:3000';
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

    const info = await transporter.sendMail(mailOptions);
    log.app.info('Invitation email sent: %s', info.messageId);
    return invitationLink;
  } catch (error) {
    log.error.error('Error sending invitation email:', error);
    throw error; // Re-throw the error to be handled by the caller
  }
};
