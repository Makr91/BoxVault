// delete.js
import { log } from '../../../utils/Logger.js';
import db from '../../../models/index.js';
const { user: User, UserOrg } = db;

/**
 * @swagger
 * /api/users/{userId}:
 *   delete:
 *     summary: Delete a user account
 *     description: >
 *       Permanently delete a user account (self-service via profile, or global
 *       admin). Refused while the user is the sole owner of any organization
 *       that still has other members — those organizations must be handed off
 *       or deleted first (personal organization included).
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user to delete
 *     responses:
 *       200:
 *         description: User deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User was deleted successfully!"
 *       400:
 *         description: User is the sole owner of an organization with other members
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Could not delete User with id=1"
 */
export const deleteUser = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).send({ message: req.__('users.userNotFound') });
    }

    // Account destruction is refused while the user is the only owner of any
    // organization that still has other members: those orgs must be handed
    // off or deleted first (personal org included, no auto-clean).
    const ownerMemberships = await UserOrg.findAll({
      where: { user_id: user.id, role: 'owner' },
      include: [{ model: db.organization, as: 'organization', attributes: ['id', 'name'] }],
    });

    for (const ownerMembership of ownerMemberships) {
      const orgId = ownerMembership.organization_id;
      // eslint-disable-next-line no-await-in-loop -- sequential per-org guard checks
      const ownerCount = await UserOrg.count({
        where: { organization_id: orgId, role: 'owner' },
      });
      if (ownerCount === 1) {
        // eslint-disable-next-line no-await-in-loop
        const memberCount = await UserOrg.count({ where: { organization_id: orgId } });
        if (memberCount > 1) {
          return res.status(400).send({
            message: req.__('users.cannotDeleteSoleOwner', {
              organization: ownerMembership.organization?.name || String(orgId),
            }),
          });
        }
      }
    }

    await user.destroy();
    return res.status(200).send({ message: req.__('users.deleted') });
  } catch (err) {
    log.error.error('Error deleting user account:', { error: err.message, userId });
    return res.status(500).send({
      message: req.__('users.delete.error', { userId }),
    });
  }
};
