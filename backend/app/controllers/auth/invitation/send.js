// send.js
import { randomBytes } from 'crypto';
import db from '../../../models/index.js';
const { organization: Organization, invitation: Invitation, user: User, UserOrg } = db;
import { log } from '../../../utils/Logger.js';
import { sendInvitationMail } from '../../mail.controller.js';
import { loadConfig } from '../../../utils/config-loader.js';
import { createExternalInvite, resolveInviterUuid } from '../../../utils/externalInvites.js';

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
export const sendInvitation = async (req, res) => {
  const { email, organizationName, inviteRole } = req.body || {};

  try {
    const authConfig = loadConfig('auth');

    const organization = await Organization.findOne({ where: { name: organizationName } });

    if (!organization) {
      return res.status(404).send({ message: req.__('organizations.organizationNotFound') });
    }

    // Validate invited role - only member and admin allowed, never owner
    const validRoles = ['member', 'admin'];
    const role = inviteRole || 'member';
    if (!validRoles.includes(role)) {
      return res.status(400).send({
        message: req.__('invitations.invalidRole'),
      });
    }

    // Parity with the auth-server rule: only org owners may invite admins —
    // org admins invite members only. Global admins arrive stamped as org
    // 'owner' by the route middleware; everyone else resolves from their
    // own membership in this organization.
    if (role === 'admin') {
      let inviterRole = req.userOrgRole;
      if (!inviterRole) {
        const inviterMembership = await UserOrg.findUserOrgRole(req.userId, organization.id);
        inviterRole = inviterMembership?.role || null;
      }
      if (inviterRole !== 'owner') {
        return res.status(403).send({
          message: req.__('invitations.adminInviteRequiresOwner'),
        });
      }
    }

    // Don't invite an existing account that already belongs to this organization.
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      const membership = await UserOrg.findUserOrgRole(existingUser.id, organization.id);
      if (membership) {
        return res.status(409).send({ message: req.__('organizations.alreadyMember') });
      }
    }

    // Customer orgs are IdP-truth: their invites live on the auth server, so
    // delegate instead of writing a local invitation. The invite token never
    // leaves the auth server, so token/link are null in the response.
    if (organization.external_issuer) {
      if (!organization.external_org_id) {
        log.error.error('External org has no external_org_id; cannot delegate invitation', {
          organizationId: organization.id,
        });
        return res.status(500).send({ message: req.__('invitations.send.error') });
      }
      try {
        const invitedByUserUuid = await resolveInviterUuid(
          req.userId,
          organization.external_issuer
        );
        const externalInvite = await createExternalInvite(
          organization,
          email,
          role,
          invitedByUserUuid
        );
        return res.status(200).send({
          message: req.__('invitations.sent'),
          invitationToken: null,
          invitationTokenExpires: externalInvite?.expires_at || null,
          organizationId: organization.id,
          invitationLink: null,
        });
      } catch (delegationErr) {
        // Surface the auth server's own 400 (e.g. inviter has no account
        // there) instead of masking it behind a generic transport error.
        const upstreamStatus = delegationErr.response?.status;
        const upstreamMessage =
          delegationErr.response?.data?.message || delegationErr.response?.data?.error;
        if (upstreamStatus === 400 && upstreamMessage) {
          return res.status(400).send({ message: upstreamMessage });
        }
        log.error.error('Failed to delegate invitation to auth server:', delegationErr);
        // Their pending-invite replacement makes a re-POST safe after any failure.
        return res.status(502).send({ message: req.__('invitations.send.externalError') });
      }
    }

    const invitationToken = randomBytes(20).toString('hex');
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
    const invitationLink = await sendInvitationMail(
      email,
      invitationToken,
      organizationName,
      invitationTokenExpires,
      req.getLocale()
    );

    return res.status(200).send({
      message: req.__('invitations.sent'),
      invitationToken,
      invitationTokenExpires,
      organizationId: organization.id,
      invitationLink,
    });
  } catch (err) {
    log.error.error('Failed to send invitation:', err);
    return res.status(500).send({ message: req.__('invitations.send.error') });
  }
};
