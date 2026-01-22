// findonewithusers.js
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
const { organization: Organization, user: User, role: Role, box: Box } = db;

/**
 * @swagger
 * /api/organization/{organizationName}/users:
 *   get:
 *     summary: Get users in a specific organization
 *     description: Retrieve all users belonging to a specific organization with their roles and box counts
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationName
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *     responses:
 *       200:
 *         description: List of users in the organization
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     description: User ID
 *                   username:
 *                     type: string
 *                     description: Username
 *                   email:
 *                     type: string
 *                     format: email
 *                     description: User email
 *                   verified:
 *                     type: boolean
 *                     description: Email verification status
 *                   suspended:
 *                     type: boolean
 *                     description: User suspension status
 *                   roles:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: User roles
 *                   totalBoxes:
 *                     type: integer
 *                     description: Number of boxes accessible to the requesting user
 *       404:
 *         description: Organization not found
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
export const findOneWithUsers = async (req, res) => {
  const { organization: organizationName } = req.params;
  const { userId } = req;

  try {
    const organization = await Organization.findOne({
      where: { name: organizationName },
      include: [
        {
          model: User,
          as: 'members',
          through: { attributes: [] },
          include: [
            {
              model: Role,
              as: 'roles',
              through: { attributes: [] },
            },
            {
              model: Box,
              as: 'box',
            },
          ],
        },
      ],
    });

    const users = organization.members.map(user => ({
      id: user.id,
      username: user.username,
      email: user.email,
      verified: user.verified,
      suspended: user.suspended,
      roles: user.roles.map(role => role.name),
      totalBoxes: user.box.filter(box => box.isPublic || (userId && user.id === userId)).length,
    }));

    return res.status(200).send(users);
  } catch (err) {
    log.error.error('Error in findOneWithUsers:', err);
    return res.status(500).send({
      message: err.message || req.__('organizations.findUsersError'),
    });
  }
};
