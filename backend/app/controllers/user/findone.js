// findone.js
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
import db from '../../models/index.js';
const { user: User, organization: Organization, UserOrg } = db;

const notFound = (req, res, title) => problem(res, req, { status: 404, type: 'not-found', title });

const USER_ATTRIBUTES = [
  'id',
  'username',
  'name',
  'email',
  'emailHash',
  'verified',
  'suspended',
  'preferredLanguage',
  'locale',
  'preferredTheme',
  'timezone',
  'authProvider',
  'avatar_url',
  'primary_organization_id',
  'entitlements',
  'createdAt',
  'updatedAt',
];

/**
 * @swagger
 * /api/organization/{organizationName}/users/{userName}:
 *   get:
 *     summary: Get a specific user in an organization
 *     description: Retrieve information about a specific user within an organization (Admin only)
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
 *       - in: path
 *         name: userName
 *         required: true
 *         schema:
 *           type: string
 *         description: Username
 *     responses:
 *       200:
 *         description: User information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       404:
 *         description: User or organization not found
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
export const findOne = async (req, res) => {
  const { organization: organizationName, userName } = req.params;

  try {
    const organization = await Organization.findOne({
      where: { name: organizationName },
    });

    if (!organization) {
      return notFound(
        req,
        res,
        req.__('organizations.organizationNotFoundWithName', { organization: organizationName })
      );
    }

    // Find user by username first
    const user = await User.findOne({
      where: { username: userName },
      attributes: USER_ATTRIBUTES,
    });

    if (!user) {
      return notFound(req, res, req.__('users.userNotFoundWithName', { username: userName }));
    }

    // Check if user is a member of the organization
    const membership = await UserOrg.findUserOrgRole(user.id, organization.id);

    if (!membership) {
      return notFound(req, res, req.__('users.userNotFoundWithName', { username: userName }));
    }

    return res.status(200).send(user);
  } catch (err) {
    log.error.error('Error retrieving user:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('users.findOne.error'),
    });
  }
};
