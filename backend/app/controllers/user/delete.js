// delete.js
import db from '../../models/index.js';
const { user: User, organization: Organization, UserOrg } = db;

/**
 * @swagger
 * /api/organization/{organization}/users/{username}:
 *   delete:
 *     summary: Remove a user from the system
 *     description: Permanently delete a user account (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *                   example: "User deleted successfully."
 *       404:
 *         description: User not found
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
  const { username, organization: orgName } = req.params;

  try {
    let user;

    // Find user within the organization context
    const organization = await Organization.findOne({ where: { name: orgName } });
    if (!organization) {
      return res.status(404).send({ message: `Organization not found: ${orgName}` });
    }
    user = await User.findOne({ where: { username } });
    if (user) {
      const membership = await UserOrg.findOne({
        where: { user_id: user.id, organization_id: organization.id },
      });
      if (!membership) {
        // User exists but not in this org, so treat as not found for this request
        user = null;
      }
    }

    if (!user) {
      return res.status(404).send({
        message: req.__('users.userNotFound'),
      });
    }

    await user.destroy();
    return res.status(200).send({ message: 'User was deleted successfully!' });
  } catch (err) {
    return res.status(500).send({
      message: err.message || req.__('errors.operationFailed'),
    });
  }
};
export { _delete as delete };
