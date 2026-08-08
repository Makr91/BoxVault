// get.js
import { log } from '../../../utils/Logger.js';
import db from '../../../models/index.js';
import { listExternalInvites } from '../../../utils/externalInvites.js';
import { extractOidcAccessToken } from '../../favorites/helpers.js';
const { organization: Organization, invitation: Invitation } = db;

/**
 * @swagger
 * /api/invitations/active/{organizationName}:
 *   get:
 *     summary: Get active invitations for an organization
 *     description: Retrieve all invitations (active, expired, accepted) for a specific organization
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationName
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the organization
 *     responses:
 *       200:
 *         description: List of invitations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     description: Invitation ID
 *                   email:
 *                     type: string
 *                     format: email
 *                     description: Invited email address
 *                   token:
 *                     type: string
 *                     description: Invitation token
 *                   expires:
 *                     type: string
 *                     format: date-time
 *                     description: Expiration date
 *                   accepted:
 *                     type: boolean
 *                     description: Whether invitation was accepted
 *                   accepted_at:
 *                     type: string
 *                     format: date-time
 *                     nullable: true
 *                     description: When the invitation was accepted
 *                   expired:
 *                     type: boolean
 *                     description: Whether invitation has expired
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *                     description: Creation date
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
export const getActiveInvitations = async (req, res) => {
  const { organization: organizationName } = req.params;

  try {
    // First, find the organization by name
    const organization = await Organization.findOne({
      where: { name: organizationName },
    });

    if (!organization) {
      return res.status(404).send({ message: req.__('organizations.organizationNotFound') });
    }

    // Customer orgs are IdP-truth: their invites live on the auth server.
    // Map their records into the exact shape the frontend already consumes;
    // ids are prefixed `ext:<org>:<invite_id>` so the delete route can route
    // them back to the auth server, and the token is never returned by their
    // API so it maps to an empty string. Their READ responses carry UPPERCASE
    // status enums, no created_at, and conditional accepted_at — normalize and
    // map defensively.
    if (organization.external_issuer) {
      const oidcAccessToken = extractOidcAccessToken(req);
      if (!oidcAccessToken) {
        return res.status(400).send({ message: req.__('invitations.requiresIdpAccount') });
      }
      try {
        const externalInvites = await listExternalInvites(organization, oidcAccessToken);
        const mapped = externalInvites.map(invite => {
          const status = typeof invite.status === 'string' ? invite.status.toLowerCase() : '';
          return {
            id: `ext:${organization.name}:${invite.invite_id}`,
            email: invite.email,
            token: '',
            expires: invite.expires_at || null,
            accepted: status === 'accepted' || !!invite.accepted_at,
            accepted_at: invite.accepted_at || null,
            expired: status === 'expired',
            createdAt: null,
          };
        });
        return res.status(200).send(mapped);
      } catch (delegationErr) {
        log.error.error('Failed to list invitations from auth server:', delegationErr);
        return res.status(502).send({ message: req.__('invitations.get.error') });
      }
    }

    const activeInvitations = await Invitation.findAll({
      where: {
        organizationId: organization.id,
        // Remove the 'accepted: false' and 'expired: false' conditions to get all invitations
      },
      attributes: [
        'id',
        'email',
        'token',
        'expires',
        'accepted',
        'accepted_at',
        'expired',
        'createdAt',
      ],
    });

    return res.status(200).send(activeInvitations);
  } catch (err) {
    log.error.error('Error in getActiveInvitations:', err);
    return res.status(500).send({
      message: req.__('invitations.get.error'),
    });
  }
};
