// delete.js
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
import { removeMembershipFromOrg } from '../organization/removeuser.js';
const { user: User } = db;

/**
 * @swagger
 * /api/organization/{organization}/users/{username}:
 *   delete:
 *     summary: Remove a user from an organization by username
 *     description: >
 *       Remove a user's membership from an organization (same semantics as the
 *       userId-addressed removal route). The caller's org role must outrank the
 *       target's; only the membership in this organization is removed — never
 *       the account.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *       - in: path
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *         description: Username to remove from the organization
 *     responses:
 *       200:
 *         description: User removed from organization successfully
 *       403:
 *         description: Caller's organization role does not outrank the target's
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found or not a member of this organization
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
const _delete = async (req, res) => {
  const { username } = req.params;
  const { organizationId } = req; // Set by verifyOrgAccess middleware

  try {
    const user = await User.findOne({ where: { username } });
    if (!user) {
      return res.status(404).send({
        message: req.__('users.userNotFound'),
      });
    }

    return await removeMembershipFromOrg(req, res, user, organizationId);
  } catch (err) {
    log.error.error('Error removing user from organization:', {
      error: err.message,
      username,
      organizationId,
      removedBy: req.userId,
    });
    return res.status(500).send({
      message: req.__('organizations.removeUserError'),
    });
  }
};
export { _delete as delete };
