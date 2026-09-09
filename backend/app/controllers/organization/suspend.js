// suspend.js
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
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
export const suspendOrganization = async (req, res) => {
  const { organization: organizationName } = req.params;

  try {
    const organization = await Organization.findOne({
      where: { name: organizationName },
    });

    if (!organization) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('organizations.organizationNotFound'),
      });
    }

    organization.suspended = true;
    await organization.save();

    return res.status(200).send({ message: req.__('organizations.suspended') });
  } catch (err) {
    log.error.error('Error suspending organization:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('organizations.suspendError'),
    });
  }
};
