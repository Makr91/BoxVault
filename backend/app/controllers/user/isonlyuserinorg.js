// isonlyuserinorg.js
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
export const isOnlyUserInOrg = async (req, res) => {
  const { organization: organizationName } = req.params;

  try {
    const organization = await Organization.findOne({
      where: { name: organizationName },
    });

    if (!organization) {
      return res.status(404).send({
        message: req.__('organizations.organizationNotFoundWithName', {
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
    return res.status(500).send({
      message: err.message || req.__('users.checkOrgUsers.error'),
    });
  }
};
