// validate.js
const db = require('../../../models');

const Organization = db.organization;
const Invitation = db.invitation;

/**
 * @swagger
 * /api/auth/validate-invitation/{token}:
 *   get:
 *     summary: Validate an invitation token
 *     description: Check if an invitation token is valid and get organization information
 *     tags: [Authentication]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Invitation token to validate
 *     responses:
 *       200:
 *         description: Valid invitation token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 organizationName:
 *                   type: string
 *                   description: Name of the organization
 *       400:
 *         description: Invalid or expired invitation token
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
exports.validateInvitationToken = async (req, res) => {
  const { token } = req.params;

  try {
    const invitation = await Invitation.findOne({ where: { token } });

    if (!invitation || invitation.expires < Date.now()) {
      return res.status(400).send({ message: req.__('invitations.invalidOrExpired') });
    }

    const organization = await Organization.findByPk(invitation.organizationId);

    return res.status(200).send({ organizationName: organization.name });
  } catch (err) {
    return res.status(500).send({
      message: err.message || req.__('invitations.validate.error'),
    });
  }
};
