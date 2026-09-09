// suspend.js
import { log } from '../../../utils/Logger.js';
import db from '../../../models/index.js';
import { problem } from '../../../utils/problem.js';
const { user: User } = db;

/**
 * @swagger
 * /api/users/{userId}/suspend:
 *   put:
 *     summary: Suspend a user
 *     description: Suspend a user account
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user to suspend
 *     responses:
 *       200:
 *         description: User suspended successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User suspended successfully."
 *       404:
 *         description: User not found
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
export const suspendUser = async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('users.userNotFound'),
      });
    }
    await user.update({ suspended: true });
    return res.status(200).send({ message: req.__('users.suspended') });
  } catch (err) {
    log.error.error('Error in suspendUser:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('users.suspend.error'),
    });
  }
};
