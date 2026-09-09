// changepassword.js
import { hashSync } from 'bcryptjs';
import { log } from '../../utils/Logger.js';
import { problem, refuse } from '../../utils/problem.js';
import db from '../../models/index.js';
import { getBcryptRounds, getPasswordPolicyErrors } from '../auth/helpers.js';
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
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 format: password
 *                 description: New password, at least the host's configured minimum (15 by default) and at most 128 characters
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
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: The password breaks a rule of the password form or is on the blocklist
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
export const changePassword = async (req, res) => {
  const { userId } = req.params;
  const { password } = req.body;

  try {
    const passwordErrors = getPasswordPolicyErrors(password, '/password');
    if (passwordErrors.length > 0) {
      return refuse(res, req, passwordErrors);
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('users.userNotFound'),
      });
    }

    user.password = hashSync(password, getBcryptRounds());
    await user.save();

    return res.status(200).send({ message: req.__('users.passwordChanged') });
  } catch (err) {
    log.error.error('Error changing password:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};
