// resume.js
import { log } from '../../../utils/Logger.js';
import db from '../../../models/index.js';
import { problem } from '../../../utils/problem.js';
const { user: User } = db;

/**
 * @swagger
 * /api/users/{userId}/resume:
 *   put:
 *     summary: Resume a suspended user
 *     description: Reactivate a suspended user account
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user to resume
 *     responses:
 *       200:
 *         description: User resumed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User resumed successfully!"
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
export const resumeUser = async (req, res) => {
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

    user.suspended = false;
    await user.save();

    return res.status(200).send({ message: req.__('users.resumed') });
  } catch (err) {
    log.error.error('Error in resumeUser:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('users.resume.error'),
    });
  }
};
