import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
import db from '../../models/index.js';
import { canWriteInOrg } from '../../utils/orgMembership.js';
const { UserOrg, organization } = db;

/**
 * @swagger
 * /api/service-accounts/organizations:
 *   get:
 *     summary: Get organizations where user can create service accounts
 *     description: Retrieve the organizations where the authenticated user holds a writing membership (member, admin or owner), the seats that may create service accounts; a guest membership is never listed
 *     tags: [Service Accounts]
 *     security:
 *       - JwtAuth: []
 *     responses:
 *       200:
 *         description: List of organizations where user can create service accounts
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     description: Organization ID
 *                   name:
 *                     type: string
 *                     description: Organization name
 *                   description:
 *                     type: string
 *                     description: Organization description
 *                   role:
 *                     type: string
 *                     enum: [member, admin, owner]
 *                     description: User's role in this organization
 *       401:
 *         description: Authentication required
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
export const getAvailableOrganizations = async (req, res) => {
  try {
    const { userId } = req;

    const userOrganizations = await UserOrg.findAll({
      where: {
        user_id: userId,
      },
      include: [
        {
          model: organization,
          as: 'organization',
          attributes: ['id', 'name', 'description'],
        },
      ],
    });

    const organizations = userOrganizations.filter(canWriteInOrg).map(userOrg => ({
      id: userOrg.organization.id,
      name: userOrg.organization.name,
      description: userOrg.organization.description,
      role: userOrg.role,
    }));

    return res.send(organizations);
  } catch (err) {
    log.error.error('Error retrieving service account organizations:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};
