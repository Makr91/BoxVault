const db = require('../../models');
const { log } = require('../../utils/Logger');
const Organization = db.organization;

/**
 * @swagger
 * /api/organization/{organization}/access-mode:
 *   put:
 *     summary: Update organization access mode
 *     description: Update the access mode and default role for an organization (admin only)
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
 *               - accessMode
 *             properties:
 *               accessMode:
 *                 type: string
 *                 enum: [private, invite_only, request_to_join]
 *                 description: Organization visibility and access mode
 *                 example: "request_to_join"
 *               defaultRole:
 *                 type: string
 *                 enum: [user, moderator]
 *                 description: Default role for new members
 *                 example: "user"
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
 *                 accessMode:
 *                   type: string
 *                   example: "request_to_join"
 *                 defaultRole:
 *                   type: string
 *                   example: "user"
 *       400:
 *         description: Invalid access mode or default role
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Requires admin role in organization
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Organization not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
const updateAccessMode = async (req, res) => {
  try {
    const { organization: organizationName } = req.params;
    const { accessMode, defaultRole } = req.body;

    // Validate access mode
    const validAccessModes = ['private', 'invite_only', 'request_to_join'];
    if (!validAccessModes.includes(accessMode)) {
      return res.status(400).send({
        message: 'Invalid access mode. Must be private, invite_only, or request_to_join.',
      });
    }

    // Validate default role
    const validRoles = ['user', 'moderator'];
    if (defaultRole && !validRoles.includes(defaultRole)) {
      return res.status(400).send({
        message: 'Invalid default role. Must be user or moderator.',
      });
    }

    // Find the organization
    const organization = await Organization.findOne({ where: { name: organizationName } });
    if (!organization) {
      return res.status(404).send({ message: 'Organization not found!' });
    }

    // Update access mode
    const updateData = { access_mode: accessMode };
    if (defaultRole) {
      updateData.default_role = defaultRole;
    }

    await organization.update(updateData);

    log.api.info('Organization access mode updated', {
      organizationName,
      organizationId: organization.id,
      accessMode,
      defaultRole: defaultRole || organization.default_role,
    });

    return res.send({
      message: 'Organization access mode updated successfully!',
      accessMode,
      defaultRole: defaultRole || organization.default_role,
    });
  } catch (err) {
    log.error.error('Error updating organization access mode:', {
      error: err.message,
      organizationName: req.params.organizationName,
    });
    return res.status(500).send({ message: 'Error updating organization access mode' });
  }
};

module.exports = { updateAccessMode };
