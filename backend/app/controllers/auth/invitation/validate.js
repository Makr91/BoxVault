import { log } from '../../../utils/Logger.js';
import db from '../../../models/index.js';
import { problem } from '../../../utils/problem.js';
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
 *       400:
 *         description: No token was given
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: Invitation not found or expired
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
export const validateInvitationToken = async (req, res) => {
  const { token } = req.params;

  if (!token) {
    return problem(res, req, {
      status: 400,
      type: 'bad-request',
      title: req.__('invitations.tokenRequired'),
    });
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
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('invitations.invalidOrExpired'),
      });
    }

    return res.status(200).send({
      message: req.__('invitations.valid'),
      email: invitation.email,
      organizationName: invitation.organization.name,
      invitedRole: invitation.invited_role,
    });
  } catch (err) {
    log.error.error('Error in validateInvitationToken:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('invitations.validate.error'),
    });
  }
};
