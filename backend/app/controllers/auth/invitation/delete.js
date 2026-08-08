// delete.js
import { log } from '../../../utils/Logger.js';
import db from '../../../models/index.js';
import { deleteExternalInvite } from '../../../utils/externalInvites.js';
import { extractOidcAccessToken } from '../../favorites/helpers.js';
const { invitation: Invitation, organization: Organization } = db;

/**
 * @swagger
 * /api/invitations/{invitationId}:
 *   delete:
 *     summary: Delete an invitation
 *     description: Remove an invitation from the system
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: invitationId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the invitation to delete
 *     responses:
 *       200:
 *         description: Invitation deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Invitation deleted successfully."
 *       404:
 *         description: Invitation not found
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
export const deleteInvitation = async (req, res) => {
  const { invitationId } = req.params;

  try {
    // External invites (customer orgs) are addressed as `ext:<org>:<invite_id>`
    // — the record lives on the auth server, so delegate the deletion.
    if (invitationId.startsWith('ext:')) {
      const [, orgName, ...inviteIdParts] = invitationId.split(':');
      const inviteId = inviteIdParts.join(':');
      const organization = await Organization.findOne({ where: { name: orgName } });

      // Their DELETE requires the org_uuid query parameter, so an org row
      // without external_org_id cannot address the invite at all.
      if (
        !organization ||
        !organization.external_issuer ||
        !organization.external_org_id ||
        !inviteId
      ) {
        return res.status(404).send({ message: req.__('invitations.notFound') });
      }

      const oidcAccessToken = extractOidcAccessToken(req);
      if (!oidcAccessToken) {
        return res.status(400).send({ message: req.__('invitations.requiresIdpAccount') });
      }
      try {
        await deleteExternalInvite(organization, inviteId, oidcAccessToken);
        return res.status(200).send({ message: req.__('invitations.deleted') });
      } catch (delegationErr) {
        if (delegationErr.response?.status === 404) {
          return res.status(404).send({ message: req.__('invitations.notFound') });
        }
        log.error.error('Failed to delete invitation on auth server:', delegationErr);
        return res.status(502).send({ message: req.__('invitations.delete.error') });
      }
    }

    const invitation = await Invitation.findByPk(invitationId);

    if (!invitation) {
      return res.status(404).send({ message: req.__('invitations.notFound') });
    }

    await invitation.destroy();
    return res.status(200).send({ message: req.__('invitations.deleted') });
  } catch (err) {
    log.error.error('Error in deleteInvitation:', err);
    return res.status(500).send({
      message: req.__('invitations.delete.error'),
    });
  }
};
