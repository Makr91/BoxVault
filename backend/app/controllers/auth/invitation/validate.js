import db from '../../../models/index.js';
const { invitation: Invitation, organization: Organization } = db;

/**
 * @swagger
 * /api/auth/validate-invitation/{token}:
 *   get:
 *     summary: Validate an invitation token
 *     description: Check if an invitation token is valid and return invitation details
 *     tags: [Authentication]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: The invitation token
 *     responses:
 *       200:
 *         description: Invitation is valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Invitation token is valid."
 *                 email:
 *                   type: string
 *                   example: "invitee@example.com"
 *                 organizationName:
 *                   type: string
 *                   example: "MyOrg"
 *       404:
 *         description: Invitation not found or expired
 */
export const validateInvitationToken = async (req, res) => {
  const { token } = req.params;

  if (!token) {
    return res.status(400).send({ message: 'Invitation token is required.' });
  }

  try {
    const invitation = await Invitation.findOne({
      where: {
        token,
        accepted: false,
        expired: false,
        expires: { [db.Sequelize.Op.gt]: new Date() },
      },
      include: [{ model: Organization, as: 'organization' }],
    });

    if (!invitation) {
      return res.status(404).send({ message: 'Invitation not found or has expired.' });
    }

    return res.status(200).send({
      message: 'Invitation token is valid.',
      email: invitation.email,
      organizationName: invitation.organization.name,
    });
  } catch (err) {
    return res.status(500).send({ message: err.message || 'Error validating invitation.' });
  }
};
