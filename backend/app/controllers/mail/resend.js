// resend.js
import { randomBytes } from 'crypto';
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
const { user: User } = db;
import { sendVerificationMail } from './verification.js';
import { loadConfig } from '../../utils/config-loader.js';

/**
 * @swagger
 * /api/mail/resend-verification:
 *   post:
 *     summary: Resend email verification
 *     description: Generate a new verification token and resend the verification email to the authenticated user
 *     tags: [Mail]
 *     security:
 *       - JwtAuth: []
 *     responses:
 *       200:
 *         description: Verification email resent successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: User is already verified
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User is already verified."
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: User or organization not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User not found."
 *       500:
 *         description: Email sending failed or server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "SMTP connection failed"
 */
export const resendVerificationMail = async (req, res) => {
  try {
    const user = await User.findByPk(req.userId);

    if (user.verified) {
      return res.status(400).send({ message: req.__('auth.userAlreadyVerified') });
    }

    // Auth config is pre-loaded and validated by middleware, so no need for try-catch here.
    const authConfig = loadConfig('auth');
    user.verificationToken = randomBytes(20).toString('hex');
    const verificationExpiryHours =
      authConfig?.auth?.jwt?.verification_token_expiry_hours?.value || 24;
    user.verificationTokenExpires = Date.now() + verificationExpiryHours * 60 * 60 * 1000;

    await user.save();
    await sendVerificationMail(
      user,
      user.verificationToken,
      user.verificationTokenExpires,
      req.getLocale()
    );
    return res.send({ message: req.__('auth.verificationEmailResent') });
  } catch (err) {
    log.error.error('Error in resendVerificationMail:', err);
    return res.status(500).send({ message: req.__('mail.errorSendingEmail') });
  }
};
