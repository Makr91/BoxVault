// resend.js
import { randomBytes } from 'crypto';
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
import db from '../../models/index.js';
const { user: User } = db;
import { sendVerificationMail } from './verification.js';
import { loadConfig } from '../../utils/config-loader.js';
import { resolveUserLanguage } from '../../utils/userLanguage.js';

const RETRY_AFTER_SECONDS = '60';

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
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       503:
 *         description: The verification mail could not be sent; Retry-After names when to try again
 *         headers:
 *           Retry-After:
 *             schema:
 *               type: integer
 *             description: Seconds to wait before resending
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
export const resendVerificationMail = async (req, res) => {
  try {
    const user = await User.findByPk(req.userId);

    if (user.verified) {
      return problem(res, req, {
        status: 400,
        type: 'bad-request',
        title: req.__('auth.userAlreadyVerified'),
      });
    }

    const authConfig = loadConfig('auth');
    user.verificationToken = randomBytes(20).toString('hex');
    const verificationExpiryHours = authConfig?.auth?.jwt?.verification_token_expiry_hours || 24;
    user.verificationTokenExpires = Date.now() + verificationExpiryHours * 60 * 60 * 1000;

    await user.save();
    await sendVerificationMail(
      user,
      user.verificationToken,
      user.verificationTokenExpires,
      await resolveUserLanguage(user.id)
    );
    return res.send({ message: req.__('auth.verificationEmailResent') });
  } catch (err) {
    log.error.error('Error in resendVerificationMail:', err);
    res.set('Retry-After', RETRY_AFTER_SECONDS);
    return problem(res, req, {
      status: 503,
      type: 'send-failed',
      title: req.__('mail.errorSendingEmail'),
    });
  }
};
