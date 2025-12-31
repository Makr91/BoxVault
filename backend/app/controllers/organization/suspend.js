// suspend.js
const db = require('../../models');

const Organization = db.organization;

/**
 * @swagger
 * /api/organization/{organizationName}/suspend:
 *   put:
 *     summary: Suspend an organization
 *     description: Suspend an organization (Admin only)
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationName
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name to suspend
 *     responses:
 *       200:
 *         description: Organization suspended successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Organization suspended successfully!"
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
exports.suspendOrganization = async (req, res) => {
  const { organizationName } = req.params;

  try {
    const organization = await Organization.findOne({
      where: { name: organizationName },
    });

    if (!organization) {
      return res.status(404).send({ message: 'Organization not found.' });
    }

    organization.suspended = true;
    await organization.save();

    return res.status(200).send({ message: 'Organization suspended successfully!' });
  } catch (err) {
    return res
      .status(500)
      .send({ message: err.message || 'Some error occurred while suspending the organization.' });
  }
};
