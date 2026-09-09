import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
const { user: User, UserOrg } = db;

const badRequest = (req, res, key) =>
  problem(res, req, { status: 400, type: 'bad-request', title: req.__(key) });

const notFound = (req, res, key) =>
  problem(res, req, { status: 404, type: 'not-found', title: req.__(key) });

/**
 * @swagger
 * /api/organization/{organization}/users/{userId}/role:
 *   put:
 *     summary: Update user's role in organization
 *     description: Change a user's role within an organization (owner only)
 *     tags: [Organizations]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *         example: acme-corp
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID to update role for
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [member, admin, owner]
 *                 description: New role to assign
 *                 example: "admin"
 *     responses:
 *       200:
 *         description: User role updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User role updated to admin"
 *                 userId:
 *                   type: integer
 *                 username:
 *                   type: string
 *                 newRole:
 *                   type: string
 *       400:
 *         description: Invalid role
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       403:
 *         description: Requires owner role in organization
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: User or organization not found, or user not a member
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
const updateUserOrgRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    const { organizationId } = req; // Set by verifyOrgAccess middleware

    // Validate role
    const validRoles = ['member', 'admin', 'owner'];
    if (!validRoles.includes(role)) {
      return badRequest(req, res, 'organizations.invalidRole');
    }

    // Find the user
    const user = await User.findByPk(userId);
    if (!user) {
      return notFound(req, res, 'users.userNotFound');
    }

    // Find user's membership in this organization
    const membership = await UserOrg.findUserOrgRole(userId, organizationId);
    if (!membership) {
      return notFound(req, res, 'organizations.userNotMember');
    }

    // An organization must always keep at least one owner
    if (membership.role === 'owner' && role !== 'owner') {
      const ownerCount = await UserOrg.count({
        where: { organization_id: organizationId, role: 'owner' },
      });

      if (ownerCount === 1) {
        return badRequest(req, res, 'organizations.cannotDemoteLastOwner');
      }
    }

    // Update the role
    const previousRole = membership.role;
    await membership.update({ role });

    log.api.info('User organization role updated', {
      userId,
      organizationId,
      oldRole: previousRole,
      newRole: role,
      updatedBy: req.userId,
    });

    return res.send({
      message: req.__('organizations.userRoleUpdated', { role }),
      userId: user.id,
      username: user.username,
      newRole: role,
    });
  } catch (err) {
    log.error.error('Error updating user organization role:', {
      error: err.message,
      userId: req.params.userId,
      organizationId: req.organizationId,
      requestedRole: req.body.role,
    });
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('organizations.updateUserRoleError'),
    });
  }
};

export { updateUserOrgRole };
