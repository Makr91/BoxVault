import { createTransport } from 'nodemailer';
import db from '../../models/index.js';
import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';

const RETRY_AFTER_SECONDS = '60';

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const formOver = (stored, form) =>
  Object.fromEntries(
    Object.entries(stored).map(([key, section]) => [
      key,
      isPlainObject(section) && isPlainObject(form[key]) ? { ...section, ...form[key] } : section,
    ])
  );

/**
 * @swagger
 * /api/mail/test-smtp:
 *   post:
 *     summary: Test the mail settings the administrator is about to save
 *     description: The test action of the mail section. The body is the section's current form values under their keys (smtp_connect, smtp_settings, smtp_auth), unsaved, laid over the stored file; one message is sent to the signed-in caller's own address. Global admins only.
 *     tags: [Mail]
 *     security:
 *       - JwtAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MailTestRequest'
 *     responses:
 *       200:
 *         description: The message was sent to the caller
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MailTestResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       403:
 *         description: The caller is not a global admin
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       503:
 *         description: The mail settings are unusable or the message could not be sent; Retry-After names when to try again
 *         headers:
 *           Retry-After:
 *             schema:
 *               type: integer
 *             description: Seconds to wait before retrying
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
export const testSmtp = async (req, res) => {
  log.app.info('Testing SMTP connection...');
  try {
    const form = isPlainObject(req.body) ? req.body : {};
    const mail = formOver(loadConfig('mail'), form);
    const caller = await db.user.findByPk(req.userId, { attributes: ['email'] });
    if (!caller?.email) {
      throw new Error('The caller has no email address.');
    }
    if (!mail.smtp_connect?.host || !mail.smtp_settings?.from) {
      throw new Error('SMTP configuration is missing or invalid.');
    }

    const transporter = createTransport({
      host: mail.smtp_connect.host,
      port: mail.smtp_connect.port,
      secure: mail.smtp_connect.secure,
      auth: {
        user: mail.smtp_auth?.user,
        pass: mail.smtp_auth?.password,
      },
      tls: {
        rejectUnauthorized: mail.smtp_connect.reject_unauthorized,
      },
    });

    log.app.info('Transporter created, verifying connection...');
    await transporter.verify();
    log.app.info('SMTP connection verified successfully');

    const info = await transporter.sendMail({
      from: mail.smtp_settings.from,
      to: caller.email,
      subject: req.__('mail.testEmailSubject'),
      text: req.__('mail.testEmailBody'),
    });

    log.app.info('Test email sent successfully:', info.messageId);
    return res
      .status(200)
      .send({ message: req.__('mail.testEmailSent'), messageId: info.messageId });
  } catch (error) {
    log.error.error('Error in SMTP test:', error);
    if (error.response) {
      log.error.error('SMTP Response:', error.response);
    }
    res.set('Retry-After', RETRY_AFTER_SECONDS);
    return problem(res, req, {
      status: 503,
      type: 'send-failed',
      title: req.__('mail.errorSendingEmail'),
    });
  }
};
