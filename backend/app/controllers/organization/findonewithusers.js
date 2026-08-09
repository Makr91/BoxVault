// findonewithusers.js
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
const { organization: Organization, user: User, role: Role, box: Box, UserOrg } = db;

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
 *                   name:
 *                     type: string
 *                     nullable: true
 *                     description: Display name (null when unset; clients fall back to username)
 *                   email:
 *                     type: string
 *                     format: email
 *                     description: User email
 *                   emailHash:
 *                     type: string
 *                     description: Hashed email for the Gravatar fallback
 *                   avatar_url:
 *                     type: string
 *                     nullable: true
 *                     description: Stored avatar URL from the identity provider
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

    // Per-organization roles (distinct from the global `roles` below)
    const memberships = await UserOrg.findAll({ where: { organization_id: organization.id } });
    const orgRoleByUserId = new Map(memberships.map(m => [m.user_id, m.role]));

    const users = organization.members.map(user => ({
      id: user.id,
      username: user.username,
      name: user.name || null,
      email: user.email,
      emailHash: user.emailHash,
      avatar_url: user.avatar_url,
      verified: user.verified,
      suspended: user.suspended,
      roles: user.roles.map(role => role.name),
      orgRole: orgRoleByUserId.get(user.id) || null,
      totalBoxes: user.box.filter(
        box =>
          box.organizationId === organization.id && (box.isPublic || (userId && user.id === userId))
      ).length,
    }));

    return res.status(200).send(users);
  } catch (err) {
    log.error.error('Error in findOneWithUsers:', err);
    return res.status(500).send({
      message: req.__('organizations.findUsersError'),
    });
  }
};
