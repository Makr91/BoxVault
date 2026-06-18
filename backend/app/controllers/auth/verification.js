// verification.js
import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
const { user: User } = db;

/**
 * @swagger
 * /api/auth/verify-mail/{token}:
 *   get:
 *     summary: Verify email address
 *     description: Verify a user's email address using a verification token
 *     tags: [Authentication]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Email verification token
 *     responses:
 *       200:
 *         description: Email verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Email verified successfully."
 *                 expirationTime:
 *                   type: number
 *                   description: Token expiration timestamp
 *       400:
 *         description: Invalid or expired verification token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Verification token has expired."
 *                 expirationTime:
 *                   type: number
 *                   description: Token expiration timestamp
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const verifyMail = async (req, res) => {
  try {
    const { token } = req.params;
    const user = await User.findOne({ where: { verificationToken: token } });

    if (!user) {
      return res.status(400).send({ message: req.__('auth.invalidVerificationToken') });
    }

    if (user.verificationTokenExpires < Date.now()) {
      return res.status(400).send({
        message: req.__('auth.tokenExpired'),
        expirationTime: user.verificationTokenExpires,
      });
    }

    user.verified = true;
    user.verificationToken = null;
    user.verificationTokenExpires = null;
    await user.save();

    return res.send({
      message: req.__('auth.emailVerified'),
      expirationTime: user.verificationTokenExpires,
    });
  } catch (err) {
    log.error.error('Error verifying email:', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};
