// roles.js
import db from '../../models/index.js';
const { user: User, role: Role } = db;

/**
 * @swagger
 * /api/users/roles:
 *   get:
 *     summary: Get current user roles
 *     description: Retrieve the roles of the currently authenticated user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User roles retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *               example: ["user", "moderator"]
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
export const getUserRoles = async (req, res) => {
  try {
    const user = await User.findByPk(req.userId, {
      include: [
        {
          model: Role,
          as: 'roles',
          attributes: ['name'],
          through: { attributes: [] },
        },
      ],
    });

    if (!user) {
      return res.status(404).send({ message: req.__('users.userNotFound') });
    }

    const roles = user.roles.map(role => role.name);
    return res.status(200).send(roles);
  } catch (err) {
    return res.status(500).send({ message: err.message || req.__('users.roles.error') });
  }
};
