const db = require('../../models');
const { log } = require('../../utils/Logger');
const { UserOrg } = db;
const User = db.user;

/**
 * @swagger
 * /api/organization/{organization}/users/{userId}/role:
 *   get:
 *     summary: Get user's role in organization
 *     description: Retrieve a user's role and membership information for a specific organization (moderator/admin only)
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
 *         description: User ID to get role for
 *         example: 1
 *     responses:
 *       200:
 *         description: User role retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userId:
 *                   type: integer
 *                 username:
 *                   type: string
 *                 email:
 *                   type: string
 *                 role:
 *                   type: string
 *                   enum: [user, moderator, admin]
 *                 isPrimary:
 *                   type: boolean
 *                   description: Whether this is user's primary organization
 *                 joinedAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Requires moderator or admin role in organization
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: User or organization not found, or user not a member
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
const getUserOrgRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { organizationId } = req; // Set by verifyOrgAccess middleware

    // Find the user
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).send({ message: 'User not found!' });
    }

    // Get user's role in this organization
    const membership = await UserOrg.findUserOrgRole(userId, organizationId);
    if (!membership) {
      return res.status(404).send({
        message: 'User is not a member of this organization!',
      });
    }

    const response = {
      userId: user.id,
      username: user.username,
      email: user.email,
      role: membership.role,
      isPrimary: membership.is_primary,
      joinedAt: membership.joined_at,
    };

    log.api.info('User organization role retrieved', {
      userId,
      organizationId,
      role: membership.role,
    });

    return res.send(response);
  } catch (err) {
    log.error.error('Error fetching user organization role:', {
      error: err.message,
      userId: req.params.userId,
      organizationId: req.organizationId,
    });
    return res.status(500).send({ message: 'Error fetching user role' });
  }
};

module.exports = { getUserOrgRole };
