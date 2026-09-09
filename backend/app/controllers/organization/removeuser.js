import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
const { user: User, Sequelize, UserOrg, invitation: Invitation } = db;

const ROLE_RANK = { owner: 3, admin: 2, member: 1 };

/**
 * Shared org-scoped membership removal (the ONE removal implementation).
 *
 * Hierarchy-gated: the actor's role in the organization must OUTRANK the
 * target's — an org owner removes admins and members, an org admin removes
 * members. Global platform admins act with owner rank in any org (the
 * route middleware stamps req.userOrgRole = 'owner' for them). Removes only
 * the target's membership in this organization — never their account and
 * never their other memberships. Reassigns the primary organization when
 * needed.
 *
 * @param {Object} req - Express request (userId, userOrgRole?, organizationId via middleware)
 * @param {Object} res - Express response
 * @param {Object} user - Target user instance
 * @param {number} organizationId - Organization scope
 * @returns {Promise<Object>} Express response
 */
const removeMembershipFromOrg = async (req, res, user, organizationId) => {
  // Find target's membership in this organization
  const membership = await UserOrg.findUserOrgRole(user.id, organizationId);
  if (!membership) {
    return problem(res, req, {
      status: 404,
      type: 'not-found',
      title: req.__('organizations.userNotMember'),
    });
  }

  // Actor's rank: global admins arrive stamped as org 'owner' by the route
  // middleware; org members resolve from their own membership.
  let actorRole = req.userOrgRole;
  if (!actorRole) {
    const actorMembership = await UserOrg.findUserOrgRole(req.userId, organizationId);
    actorRole = actorMembership?.role || null;
  }

  if (!actorRole || (ROLE_RANK[actorRole] || 0) <= (ROLE_RANK[membership.role] || 0)) {
    return problem(res, req, {
      status: 403,
      type: 'forbidden',
      title: req.__('organizations.removeRequiresHigherRole'),
    });
  }

  // Check if this is their primary organization
  if (membership.is_primary) {
    // Count other organizations
    const otherOrgs = await UserOrg.findAll({
      where: {
        user_id: user.id,
        organization_id: { [Sequelize.Op.ne]: organizationId },
      },
    });

    if (otherOrgs.length === 0) {
      return problem(res, req, {
        status: 400,
        type: 'bad-request',
        title: req.__('organizations.cannotRemoveOnlyOrg'),
      });
    }

    // Set another organization as primary before removing
    await UserOrg.setPrimaryOrganization(user.id, otherOrgs[0].organization_id);

    // Update user's denormalized primary_organization_id
    await User.update(
      { primary_organization_id: otherOrgs[0].organization_id },
      { where: { id: user.id } }
    );
  }

  // Remove user from organization
  await membership.destroy();

  await Invitation.destroy({
    where: { email: user.email, organizationId, accepted: false },
  });

  log.api.info('User removed from organization', {
    userId: user.id,
    organizationId,
    removedBy: req.userId,
    username: user.username,
  });

  return res.send({
    message: req.__('organizations.userRemoved', { username: user.username }),
    userId: user.id,
    username: user.username,
  });
};

/**
 * @swagger
 * /api/organization/{organization}/users/{userId}:
 *   delete:
 *     summary: Remove user from organization
 *     description: >
 *       Remove a user's membership from an organization. The caller's org role
 *       must outrank the target's (owner removes admins/members, admin
 *       removes members; global admins may act in any org). Automatically
 *       reassigns primary organization if needed.
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
 *         description: User ID to remove from organization
 *         example: 1
 *     responses:
 *       200:
 *         description: User removed from organization successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User john_user removed from organization"
 *                 userId:
 *                   type: integer
 *                 username:
 *                   type: string
 *       400:
 *         description: Cannot remove user from their only organization
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
 *         description: Caller's organization role does not outrank the target's
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
const removeUserFromOrg = async (req, res) => {
  try {
    const { userId } = req.params;
    const { organizationId } = req; // Set by verifyOrgAccess middleware

    // Find the user
    const user = await User.findByPk(userId);
    if (!user) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('users.userNotFound'),
      });
    }

    return await removeMembershipFromOrg(req, res, user, organizationId);
  } catch (err) {
    log.error.error('Error removing user from organization:', {
      error: err.message,
      userId: req.params.userId,
      organizationId: req.organizationId,
      removedBy: req.userId,
    });
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('organizations.removeUserError'),
    });
  }
};

export { removeUserFromOrg, removeMembershipFromOrg };
