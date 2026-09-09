// resume.js
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
import db from '../../models/index.js';
const { organization: Organization } = db;

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
export const resumeOrganization = async (req, res) => {
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

    organization.suspended = false;
    await organization.save();

    return res.status(200).send({ message: req.__('organizations.resumed') });
  } catch (err) {
    log.error.error('Error resuming organization:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('organizations.resumeError'),
    });
  }
};
