// findallwithusers.js
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
const { organization: Organization, user: User, role: Role, box: Box } = db;

/**
 * @swagger
 * /api/organizations-with-users:
 *   get:
 *     summary: Get all organizations with users and box counts
 *     description: Retrieve all organizations with their users, roles, and box counts. Box counts are filtered based on user access.
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of organizations with detailed user information
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 allOf:
 *                   - $ref: '#/components/schemas/Organization'
 *                   - type: object
 *                     properties:
 *                       users:
 *                         type: array
 *                         items:
 *                           allOf:
 *                             - $ref: '#/components/schemas/User'
 *                             - type: object
 *                               properties:
 *                                 totalBoxes:
 *                                   type: integer
 *                                   description: Number of boxes accessible to the requesting user
 *                       totalBoxes:
 *                         type: integer
 *                         description: Total number of boxes in the organization accessible to the requesting user
 *       401:
 *         description: Unauthorized - invalid token
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
export const findAllWithUsers = async (req, res) => {
  const { userId } = req;

  try {
    const organizations = await Organization.findAll({
      include: [
        {
          model: User,
          as: 'members',
          // Junction role = the user's role IN THIS ORG (distinct from the
          // global `roles` include below)
          through: { attributes: ['role'] },
          include: [
            {
              model: Role,
              as: 'roles',
              attributes: ['name'],
              through: { attributes: [] },
            },
            {
              model: Box,
              as: 'box',
              attributes: ['id', 'isPublic', 'organizationId'],
            },
          ],
        },
      ],
    });

    const result = organizations.map(org => {
      const countOrgBoxes = user =>
        user.box.filter(
          box => box.organizationId === org.id && (box.isPublic || (userId && user.id === userId))
        ).length;

      return {
        ...org.toJSON(),
        members: org.members.map(user => {
          const { password, UserOrg: membership, ...userWithoutPassword } = user.toJSON();
          void password;
          return {
            ...userWithoutPassword,
            orgRole: membership?.role || null,
            totalBoxes: countOrgBoxes(user),
          };
        }),
        totalBoxes: org.members.reduce((acc, user) => acc + countOrgBoxes(user), 0),
      };
    });

    return res.status(200).send(result);
  } catch (err) {
    log.error.error('Error retrieving organizations with users:', err);
    return res.status(500).send({
      message: req.__('organizations.findAllError'),
    });
  }
};
