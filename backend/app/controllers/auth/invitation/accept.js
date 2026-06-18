// accept.js
import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';

const { invitation: Invitation, organization: Organization, user: User, UserOrg } = db;

/**
 * @swagger
 * /api/auth/invitations/{token}/accept:
 *   post:
 *     summary: Accept an organization invitation as the logged-in user
 *     description: >
 *       Adds the authenticated user to the invitation's organization using the
 *       invited role. The signed-in account's email must match the invited email.
 *       Unlike signup, this works for existing accounts (local or OIDC) joining an
 *       additional organization; the new membership is never marked primary.
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: The invitation token
 *     responses:
 *       200:
 *         description: Invitation accepted; user added to the organization
 *       403:
 *         description: Signed-in email does not match the invited email
 *       404:
 *         description: Invitation invalid/expired, or organization not found
 *       409:
 *         description: User is already a member of this organization
 *       500:
 *         description: Internal server error
 */
export const acceptInvitation = async (req, res) => {
  const { token } = req.params;
  const { userId } = req;

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
      return res.status(404).send({ message: req.__('invitations.invalidOrExpired') });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(401).send({ message: req.__('users.userNotFound') });
    }

    // The invitation is addressed to a specific email; the accepting account must match.
    if (!user.email || user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      return res.status(403).send({
        message: req.__('invitations.emailMismatch', { email: invitation.email }),
      });
    }

    const { organization } = invitation;
    if (!organization) {
      return res.status(404).send({ message: req.__('organizations.organizationNotFound') });
    }

    // Already a member: consume the now-redundant invitation and report it.
    const existing = await UserOrg.findUserOrgRole(userId, organization.id);
    if (existing) {
      await invitation.update({ accepted: true });
      return res.status(409).send({ message: req.__('organizations.alreadyMember') });
    }

    // Joining an additional organization never changes the user's primary org.
    await UserOrg.create({
      user_id: userId,
      organization_id: organization.id,
      role: invitation.invited_role,
      is_primary: false,
    });

    await invitation.update({ accepted: true });

    log.api.info('Invitation accepted', {
      userId,
      organizationId: organization.id,
      role: invitation.invited_role,
    });

    return res.status(200).send({
      message: req.__('invitations.accepted', { organization: organization.name }),
      organization: organization.name,
      role: invitation.invited_role,
    });
  } catch (err) {
    log.error.error('Error accepting invitation:', {
      error: err.message,
      userId: req.userId,
    });
    return res.status(500).send({ message: req.__('invitations.accept.error') });
  }
};
