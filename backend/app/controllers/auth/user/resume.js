// resume.js
import db from '../../../models/index.js';
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
export const resumeUser = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).send({ message: req.__('users.userNotFound') });
    }

    user.suspended = false;
    await user.save();

    return res.status(200).send({ message: req.__('users.resumed') });
  } catch (err) {
    return res.status(500).send({ message: err.message || req.__('users.resume.error') });
  }
};
