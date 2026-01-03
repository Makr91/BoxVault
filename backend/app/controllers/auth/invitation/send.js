// send.js
const crypto = require('crypto');
const db = require('../../../models');
const mailController = require('../../mail.controller');
const { loadConfig } = require('../../../utils/config-loader');

const Organization = db.organization;
const Invitation = db.invitation;

let authConfig;
try {
  authConfig = loadConfig('auth');
} catch {
  // Config will be loaded when needed
}

/**
 * @swagger
 * /api/auth/invite:
 *   post:
 *     summary: Send an invitation to join an organization
 *     description: Send an email invitation for a user to join a specific organization
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - organizationName
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address to send invitation to
 *               organizationName:
 *                 type: string
 *                 description: Name of the organization to invite user to
 *     responses:
 *       200:
 *         description: Invitation sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Invitation sent successfully!"
 *                 invitationToken:
 *                   type: string
 *                   description: The invitation token
 *                 invitationTokenExpires:
 *                   type: number
 *                   description: Expiration timestamp
 *                 organizationId:
 *                   type: integer
 *                   description: ID of the organization
 *                 invitationLink:
 *                   type: string
 *                   description: Direct link to accept invitation
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
exports.sendInvitation = async (req, res) => {
  const { email, organizationName, inviteRole } = req.body;

  try {
    const organization = await Organization.findOne({ where: { name: organizationName } });

    if (!organization) {
      return res.status(404).send({ message: 'Organization not found.' });
    }

    // Validate invited role - only user and moderator allowed, never admin
    const validRoles = ['user', 'moderator'];
    const role = inviteRole || 'user';
    if (!validRoles.includes(role)) {
      return res.status(400).send({
        message: 'Invalid role. Invitations can only assign user or moderator roles.',
      });
    }

    const invitationToken = crypto.randomBytes(20).toString('hex');
    const invitationExpiryHours = authConfig.auth?.jwt?.invitation_token_expiry_hours?.value || 24;
    const invitationTokenExpires = Date.now() + invitationExpiryHours * 60 * 60 * 1000;

    // Save the invitation details in the database
    await Invitation.create({
      email,
      token: invitationToken,
      expires: invitationTokenExpires,
      organizationId: organization.id,
      invited_role: role,
    });

    // Send the invitation email and get the invitation link
    const invitationLink = await mailController.sendInvitationMail(
      email,
      invitationToken,
      organizationName,
      invitationTokenExpires
    );

    return res.status(200).send({
      message: 'Invitation sent successfully!',
      invitationToken,
      invitationTokenExpires,
      organizationId: organization.id,
      invitationLink,
    });
  } catch (err) {
    return res
      .status(500)
      .send({ message: err.message || 'Some error occurred while sending the invitation.' });
  }
};
