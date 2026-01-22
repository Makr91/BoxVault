// verification.js
import { getTestMessageUrl } from 'nodemailer';
import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import { createTransporter, getSmtpConfig } from './helpers.js';
import { t } from '../../config/i18n.js';

export const sendVerificationMail = async (
  user,
  verificationToken,
  expirationTime,
  locale = 'en'
) => {
  try {
    // Configs are loaded just-in-time. If they fail, the error will be caught by the calling controller.
    const appConfig = loadConfig('app');
    const smtpConfig = getSmtpConfig();
    if (!smtpConfig || !smtpConfig.smtp_settings || !smtpConfig.smtp_settings.from) {
      throw new Error('SMTP configuration is missing or invalid.');
    }

    const transporter = createTransporter();

    const frontendUrl = appConfig?.boxvault?.origin?.value || 'http://localhost:3000';
    // Change this line to point to the profile page
    const verificationLink = `${frontendUrl}/profile?token=${verificationToken}`;
    const expirationDate = new Date(expirationTime).toLocaleString();

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

    const info = await transporter.sendMail(mailOptions);
    const previewUrl = getTestMessageUrl(info);
    log.app.info('Verification email sent: %s', info.messageId);
    log.app.info('Preview URL: %s', previewUrl);

    return info;
  } catch (error) {
    log.error.error('Error sending verification email:', error);
    throw error; // Re-throw the error so it can be handled by the caller
  }
};
