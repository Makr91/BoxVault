// resume.js
const db = require('../../models');

const Organization = db.organization;

/**
 * @swagger
 * /api/organization/{organizationName}/resume:
 *   put:
 *     summary: Resume a suspended organization
 *     description: Reactivate a suspended organization (Admin only)
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationName
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name to resume
 *     responses:
 *       200:
 *         description: Organization resumed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Organization resumed successfully!"
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
exports.resumeOrganization = async (req, res) => {
  const { organization: organizationName } = req.params;

  try {
    const organization = await Organization.findOne({
      where: { name: organizationName },
    });

    if (!organization) {
      return res.status(404).send({ message: 'Organization not found.' });
    }

    organization.suspended = false;
    await organization.save();

    return res.status(200).send({ message: 'Organization resumed successfully!' });
  } catch (err) {
    return res
      .status(500)
      .send({ message: err.message || 'Some error occurred while resuming the organization.' });
  }
};
