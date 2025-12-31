// send.js
const crypto = require('crypto');
const db = require('../../../models');
const mailController = require('../../mail.controller');

const Organization = db.organization;
const Invitation = db.invitation;

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
  const { email, organizationName } = req.body;

  try {
    const organization = await Organization.findOne({ where: { name: organizationName } });

    if (!organization) {
      return res.status(404).send({ message: 'Organization not found.' });
    }

    const invitationToken = crypto.randomBytes(20).toString('hex');
    const invitationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    // Save the invitation details in the database
    await Invitation.create({
      email,
      token: invitationToken,
      expires: invitationTokenExpires,
      organizationId: organization.id,
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
