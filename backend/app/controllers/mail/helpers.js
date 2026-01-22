// helpers.js
import { createTransport } from 'nodemailer';
import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';

const getSmtpConfig = () => {
  try {
    return loadConfig('mail');
  } catch (e) {
    log.error.error(`Failed to load SMTP configuration: ${e.message}`);
    throw new Error(`Failed to load SMTP configuration: ${e.message}`);
  }
};

/**
 * Create a nodemailer transporter with SMTP configuration
 * @returns {Object} Nodemailer transporter
 */
const createTransporter = () => {
  const smtpConfig = getSmtpConfig();

  if (!smtpConfig || !smtpConfig.smtp_connect || !smtpConfig.smtp_auth) {
    throw new Error('SMTP configuration is missing or invalid.');
  }

  return createTransport({
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
};

export { createTransporter, getSmtpConfig };
