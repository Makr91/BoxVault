// demote.js
import db from '../../models/index.js';
const { user: User, role: Role } = db;

/**
 * @swagger
 * /api/users/{userId}/demote:
 *   put:
 *     summary: Demote moderator to user
 *     description: Demote a moderator back to regular user role
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
 *     responses:
 *       200:
 *         description: User demoted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Demoted to user successfully!"
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
export const demoteToUser = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).send({ message: req.__('users.userNotFound') });
    }

    const userRole = await Role.findOne({ where: { name: 'user' } });
    const moderatorRole = await Role.findOne({ where: { name: 'moderator' } });

    // Remove the moderator role if it exists
    await user.removeRole(moderatorRole);

    // Add the user role
    await user.addRole(userRole);

    return res.status(200).send({ message: req.__('users.demotedToUser') });
  } catch (err) {
    return res.status(500).send({ message: err.message || req.__('errors.operationFailed') });
  }
};
