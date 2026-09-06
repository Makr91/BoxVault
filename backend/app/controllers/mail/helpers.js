// helpers.js
import { createTransport } from 'nodemailer';
import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';

const getSmtpConfig = () => {
  try {
    return loadConfig('mail');
  } catch (e) {
    log.error.error(`Failed to load SMTP configuration: ${e.message}`);
    throw new Error(`Failed to load SMTP configuration: ${e.message}`, { cause: e });
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
    host: smtpConfig.smtp_connect.host,
    port: smtpConfig.smtp_connect.port,
    secure: smtpConfig.smtp_connect.secure,
    auth: {
      user: smtpConfig.smtp_auth.user,
      pass: smtpConfig.smtp_auth.password,
    },
  });
};

export { createTransporter, getSmtpConfig };
