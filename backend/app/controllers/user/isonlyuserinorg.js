// isonlyuserinorg.js
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
import db from '../../models/index.js';
const { organization: Organization } = db;

/**
 * @swagger
 * /api/organizations/{organizationName}/only-user:
 *   get:
 *     summary: Check if user is the only user in organization
 *     description: Determine if the current user is the only user in the specified organization
 *     tags: [Users]
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
 *         description: Check completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isOnlyUser:
 *                   type: boolean
 *                   description: Whether the user is the only user in the organization
 *       404:
 *         description: Organization not found
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
export const isOnlyUserInOrg = async (req, res) => {
  const { organization: organizationName } = req.params;

  try {
    const organization = await Organization.findOne({
      where: { name: organizationName },
    });

    if (!organization) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('organizations.organizationNotFoundWithName', {
          organization: organizationName,
        }),
      });
    }

    const userCount = await organization.countMembers();

    if (userCount === 1) {
      return res.status(200).send({ isOnlyUser: true });
    }
    return res.status(200).send({ isOnlyUser: false });
  } catch (err) {
    log.error.error('Error checking organization users:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('users.checkOrgUsers.error'),
    });
  }
};
