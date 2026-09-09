// changeemail.js
import { log } from '../../utils/Logger.js';
import { conflict, problem } from '../../utils/problem.js';
import db from '../../models/index.js';
import { generateEmailHash } from '../../utils/identity.js';
const { user: User, Sequelize } = db;
const { Op } = Sequelize;

/**
 * @swagger
 * /api/users/{userId}/change-email:
 *   put:
 *     summary: Change user email
 *     description: Change the email address for a specific user
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
 *               - new_email
 *             properties:
 *               new_email:
 *                 type: string
 *                 format: email
 *                 description: New email address
 *     responses:
 *       200:
 *         description: Email changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Email changed successfully!"
 *       404:
 *         description: User not found
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       409:
 *         description: Another account already uses that email
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: The email breaks a rule of the email form
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
export const changeEmail = async (req, res) => {
  const { userId } = req.params;
  const { new_email: newEmail } = req.body;

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('users.userNotFound'),
      });
    }

    const existingUser = await User.findOne({
      where: { email: newEmail, id: { [Op.ne]: user.id } },
    });
    if (existingUser) {
      return conflict(res, req, '/new_email', 'global');
    }

    user.email = newEmail;
    user.emailHash = generateEmailHash(newEmail);
    await user.save();

    return res.status(200).send({ message: req.__('users.emailChanged') });
  } catch (err) {
    log.error.error('Error changing email:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};
