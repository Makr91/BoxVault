// send.js
import { randomBytes } from 'crypto';
import db from '../../../models/index.js';
const { organization: Organization, invitation: Invitation, user: User, UserOrg } = db;
import { log } from '../../../utils/Logger.js';
import { sendInvitationMail } from '../../mail.controller.js';
import { loadConfig } from '../../../utils/config-loader.js';
import { createExternalInvite } from '../../../utils/externalInvites.js';
import { resolveEmailLanguage } from '../../../utils/userLanguage.js';
import { extractOidcAccessToken } from '../../favorites/helpers.js';

// Parity with the auth-server rule: only org owners may invite admins — org
// admins invite members only. Global admins arrive stamped as org 'owner' by
// the route middleware; everyone else resolves from their own membership.
const resolveInviterOrgRole = async (req, organization) => {
  if (req.userOrgRole) {
    return req.userOrgRole;
  }
  const inviterMembership = await UserOrg.findUserOrgRole(req.userId, organization.id);
  return inviterMembership?.role || null;
};

const surfaceDelegationError = (req, res, delegationErr) => {
  // Surface the auth server's own 400/403 (validation, Mode B RBAC) instead
  // of masking it behind a generic transport error.
  const upstreamStatus = delegationErr.response?.status;
  const upstreamMessage =
    delegationErr.response?.data?.message ||
    delegationErr.response?.data?.detail ||
    delegationErr.response?.data?.error;
  if ((upstreamStatus === 400 || upstreamStatus === 403) && upstreamMessage) {
    return res.status(upstreamStatus).send({ message: upstreamMessage });
  }
  log.error.error('Failed to delegate invitation to auth server:', delegationErr);
  // Their pending-invite replacement makes a re-POST safe after any failure.
  return res.status(502).send({ message: req.__('invitations.send.externalError') });
};

// Contract v2 Mode B: invites are human actions, so the call rides the acting
// user's own OIDC access token — the auth server derives the actor from it.
// Local accounts have no token there and cannot act.
const sendDelegatedInvitation = async (req, res, organization, email, role) => {
  if (!organization.external_org_id) {
    log.error.error('External org has no external_org_id; cannot delegate invitation', {
      organizationId: organization.id,
    });
    return res.status(500).send({ message: req.__('invitations.send.error') });
  }

  const oidcAccessToken = extractOidcAccessToken(req);
  if (!oidcAccessToken) {
    return res.status(400).send({ message: req.__('invitations.requiresIdpAccount') });
  }

  try {
    const externalInvite = await createExternalInvite(organization, email, role, oidcAccessToken);
    return res.status(200).send({
      message: req.__('invitations.sent'),
      invitationToken: null,
      invitationTokenExpires: externalInvite?.expires_at || null,
      organizationId: organization.id,
      invitationLink: null,
    });
  } catch (delegationErr) {
    return surfaceDelegationError(req, res, delegationErr);
  }
};

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

    if (role === 'admin') {
      const inviterRole = await resolveInviterOrgRole(req, organization);
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
      return sendDelegatedInvitation(req, res, organization, email, role);
    }

    const invitationToken = randomBytes(20).toString('hex');
    const invitationExpiryHours = authConfig.auth?.jwt?.invitation_token_expiry_hours?.value || 24;
    const invitationTokenExpires = Date.now() + invitationExpiryHours * 60 * 60 * 1000;

    // One live invitation per (organization, address), matching the identity
    // provider's semantics for the orgs it manages: re-inviting replaces the
    // pending invite rather than adding a second one, so the token in the
    // superseded email stops working.
    // Addresses are matched case-insensitively: the collation decides
    // otherwise, so on SQLite and Postgres a differently-cased re-invite would
    // slip past and leave two live tokens for the same mailbox.
    const pendingInvitations = await Invitation.findAll({
      where: { organizationId: organization.id, accepted: false },
    });
    const pendingInvitation = pendingInvitations.find(
      candidate => candidate.email?.toLowerCase() === email.toLowerCase()
    );

    if (pendingInvitation) {
      await pendingInvitation.update({
        token: invitationToken,
        expires: invitationTokenExpires,
        expired: false,
        invited_role: role,
        invited_by: req.userId,
      });
    } else {
      await Invitation.create({
        email,
        token: invitationToken,
        expires: invitationTokenExpires,
        organizationId: organization.id,
        invited_role: role,
        invited_by: req.userId,
      });
    }

    // The invitation is written FOR the invitee, so it renders in their
    // language — not the inviter's request locale. An invitee with no account
    // yet falls back to the organization's language.
    const invitationLink = await sendInvitationMail(
      email,
      invitationToken,
      organizationName,
      invitationTokenExpires,
      await resolveEmailLanguage(email, organization)
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
