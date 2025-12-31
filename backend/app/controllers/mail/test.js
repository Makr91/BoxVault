// test.js
const { log } = require('../../utils/Logger');
const { createTransporter, smtpConfig } = require('./helpers');

/**
 * @swagger
 * /api/mail/test-smtp:
 *   post:
 *     summary: Test SMTP configuration
 *     description: Send a test email to verify SMTP server configuration and connectivity
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
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: SMTP configuration error or email sending failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Error sending test email"
 *                 error:
 *                   type: string
 *                   example: "SMTP connection failed"
 *                 stack:
 *                   type: string
 *                   description: "Error stack trace (for debugging)"
 */
exports.testSmtp = async (req, res) => {
  log.app.info('Testing SMTP connection...');
  try {
    const transporter = createTransporter();

    log.app.info('Transporter created, verifying connection...');
    await transporter.verify();
    log.app.info('SMTP connection verified successfully');

    log.app.info('Sending test email...');
    const info = await transporter.sendMail({
      from: smtpConfig.smtp_settings.from.value,
      to: req.body.testEmail,
      subject: 'SMTP Test Email',
      text: 'This is a test email to verify SMTP configuration.',
    });

    log.app.info('Test email sent successfully:', info.messageId);
    return res
      .status(200)
      .send({ message: 'Test email sent successfully', messageId: info.messageId });
  } catch (error) {
    log.error.error('Error in SMTP test:', error);
    log.error.error('Error stack:', error.stack);
    if (error.response) {
      log.error.error('SMTP Response:', error.response);
    }
    return res
      .status(500)
      .send({ message: 'Error sending test email', error: error.message, stack: error.stack });
  }
};
