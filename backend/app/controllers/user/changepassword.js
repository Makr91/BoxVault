// changepassword.js
import { hashSync } from 'bcryptjs';
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
import { getBcryptRounds, getPasswordPolicyError } from '../auth/helpers.js';
const { user: User } = db;

/**
 * @swagger
 * /api/users/{userId}/change-password:
 *   put:
 *     summary: Change user password
 *     description: Change the password for a specific user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newPassword
 *             properties:
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 description: New password
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Password changed successfully!"
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const changePassword = async (req, res) => {
  const { userId } = req.params;
  const { newPassword } = req.body;

  try {
    // Password policy knobs (#18) apply to password changes too
    const passwordPolicyError = getPasswordPolicyError(newPassword, req);
    if (passwordPolicyError) {
      return res.status(400).send({ message: passwordPolicyError });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).send({ message: req.__('users.userNotFound') });
    }

    user.password = hashSync(newPassword, getBcryptRounds());
    await user.save();

    return res.status(200).send({ message: req.__('users.passwordChanged') });
  } catch (err) {
    log.error.error('Error changing password:', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};
