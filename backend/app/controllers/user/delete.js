// delete.js
const db = require('../../models');

const User = db.user;
const Organization = db.organization;

/**
 * @swagger
 * /api/organization/{organizationName}/users/{username}:
 *   delete:
 *     summary: Delete a user from an organization
 *     description: Remove a user from a specific organization (Admin only)
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
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *         description: Username to delete
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
 *                   example: "User john deleted successfully."
 *       404:
 *         description: User or organization not found
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
exports.delete = async (req, res) => {
  const { organizationName, userName } = req.params;

  try {
    const organization = await Organization.findOne({
      where: { name: organizationName },
    });

    if (!organization) {
      return res.status(404).send({
        message: `Organization ${organizationName} not found.`,
      });
    }

    const user = await User.findOne({
      where: {
        username: userName,
        organizationId: organization.id,
      },
    });

    if (!user) {
      return res.status(404).send({
        message: `User ${userName} not found.`,
      });
    }

    await user.destroy();
    return res.status(200).send({ message: `User ${userName} deleted successfully.` });
  } catch (err) {
    return res.status(500).send({
      message: err.message || 'Some error occurred while deleting the user.',
    });
  }
};
