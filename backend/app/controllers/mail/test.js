// test.js
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
import { createTransporter, getSmtpConfig } from './helpers.js';

const RETRY_AFTER_SECONDS = '60';

/**
 * @swagger
 * /api/mail/test-smtp:
 *   post:
 *     summary: Test SMTP configuration
 *     description: Send a test email to verify SMTP server configuration and connectivity. Global admins only; a service account is refused unless it is a live superadmin account.
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
 *         description: Test email sent successfully
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
 *         description: The caller is not a global admin, or is a service account other than a live superadmin one
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       503:
 *         description: The SMTP configuration is unusable or the test mail could not be sent; Retry-After names when to try again
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
    const smtpConfig = getSmtpConfig();

    if (!smtpConfig || !smtpConfig.smtp_settings || !smtpConfig.smtp_settings.from) {
      throw new Error('SMTP configuration is missing or invalid.');
    }

    const transporter = createTransporter();

    log.app.info('Transporter created, verifying connection...');
    await transporter.verify();
    log.app.info('SMTP connection verified successfully');

    log.app.info('Sending test email...');
    const info = await transporter.sendMail({
      from: smtpConfig.smtp_settings.from,
      to: req.body.test_email,
      subject: req.__('mail.testEmailSubject'),
      text: req.__('mail.testEmailBody'),
    });

    log.app.info('Test email sent successfully:', info.messageId);
    return res
      .status(200)
      .send({ message: req.__('mail.testEmailSent'), messageId: info.messageId });
  } catch (error) {
    log.error.error('Error in SMTP test:', error);
    log.error.error('Error stack:', error.stack);
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
