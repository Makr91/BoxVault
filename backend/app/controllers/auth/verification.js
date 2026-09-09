// verification.js
import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
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
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
export const verifyMail = async (req, res) => {
  try {
    const { token } = req.params;
    const user = await User.findOne({ where: { verificationToken: token } });

    if (!user) {
      return problem(res, req, {
        status: 400,
        type: 'bad-request',
        title: req.__('auth.invalidVerificationToken'),
      });
    }

    if (user.verificationTokenExpires < Date.now()) {
      return problem(res, req, {
        status: 400,
        type: 'bad-request',
        title: req.__('auth.tokenExpired'),
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
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};
