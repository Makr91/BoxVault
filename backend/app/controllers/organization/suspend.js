// suspend.js
import db from '../../models/index.js';
const { organization: Organization } = db;

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
export const suspendOrganization = async (req, res) => {
  const { organization: organizationName } = req.params;

  try {
    const organization = await Organization.findOne({
      where: { name: organizationName },
    });

    if (!organization) {
      return res.status(404).send({ message: req.__('organizations.organizationNotFound') });
    }

    organization.suspended = true;
    await organization.save();

    return res.status(200).send({ message: req.__('organizations.suspended') });
  } catch (err) {
    return res.status(500).send({ message: err.message || req.__('organizations.suspendError') });
  }
};
