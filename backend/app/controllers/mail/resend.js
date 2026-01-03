// resend.js
const crypto = require('crypto');
const { log } = require('../../utils/Logger');
const db = require('../../models');
const { sendVerificationMail } = require('./verification');
const { loadConfig } = require('../../utils/config-loader');

let authConfig;
try {
  authConfig = loadConfig('auth');
} catch {
  // Config will be loaded when needed
}

const User = db.user;
const Organization = db.organization;

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
exports.resendVerificationMail = async (req, res) => {
  try {
    const user = await User.findByPk(req.userId, {
      include: [{ model: Organization, as: 'primaryOrganization' }],
    });

    if (!user) {
      return res.status(404).send({ message: req.__('users.userNotFound') });
    }

    if (!user.primaryOrganization) {
      return res.status(404).send({ message: req.__('organizations.organizationNotFound') });
    }

    if (user.verified) {
      return res.status(400).send({ message: req.__('auth.userAlreadyVerified') });
    }

    user.verificationToken = crypto.randomBytes(20).toString('hex');
    const verificationExpiryHours =
      authConfig.auth?.jwt?.verification_token_expiry_hours?.value || 24;
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
