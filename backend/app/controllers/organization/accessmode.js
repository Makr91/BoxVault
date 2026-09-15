import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
import db from '../../models/index.js';
const { organization: Organization } = db;

/**
 * @swagger
 * /api/organization/{organization}/access-mode:
 *   put:
 *     summary: Update organization access mode
 *     description: Update the access mode and default role for an organization (admin/owner only)
 *     tags: [Organizations]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *         example: acme-corp
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - access_mode
 *             properties:
 *               access_mode:
 *                 type: string
 *                 enum: [private, invite, request]
 *                 description: Organization visibility and access mode
 *                 example: "request"
 *               default_role:
 *                 type: string
 *                 enum: [member, admin, guest]
 *                 description: Default role for new members; guest opens a read-only door
 *                 example: "member"
 *     responses:
 *       200:
 *         description: Access mode updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Organization access mode updated successfully!"
 *                 access_mode:
 *                   type: string
 *                   example: "request"
 *                 default_role:
 *                   type: string
 *                   example: "member"
 *       401:
 *         description: Authentication required
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       403:
 *         description: Requires admin or owner role in organization
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: Organization not found
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: The access mode or default role is not one of the allowed values
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
const updateAccessMode = async (req, res) => {
  try {
    const { organization: organizationName } = req.params;
    const { access_mode, default_role } = req.body;

    // Find the organization
    const organization = await Organization.findOne({ where: { name: organizationName } });

    // Update access mode
    const updateData = { access_mode };
    if (default_role) {
      updateData.default_role = default_role;
    }

    await organization.update(updateData);

    log.api.info('Organization access mode updated', {
      organizationName,
      organizationId: organization.id,
      access_mode,
      default_role: default_role || organization.default_role,
    });

    return res.send({
      message: req.__('organizations.accessModeUpdated'),
      access_mode,
      default_role: default_role || organization.default_role,
    });
  } catch (err) {
    log.error.error('Error updating organization access mode:', {
      error: err.message,
      organizationName: req.params.organizationName,
    });
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('organizations.updateAccessModeError'),
    });
  }
};

export { updateAccessMode };
