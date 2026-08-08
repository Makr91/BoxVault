import { loadConfig } from '../../../utils/config-loader.js';
import { log } from '../../../utils/Logger.js';
import { sendHubNotification } from '../../../utils/notifyHub.js';
import { resolveUserRecipients } from '../../../utils/notifyRecipients.js';

const notifyInvitationAccepted = async (invitation, organization, acceptedEmail) => {
  try {
    if (!invitation.invited_by) {
      return;
    }
    const origin = loadConfig('app').boxvault.origin.value;
    const recipients = await resolveUserRecipients([invitation.invited_by]);
    await Promise.all(
      recipients.map(({ issuer, uuid }) =>
        sendHubNotification({
          issuer,
          recipient: { user_uuid: uuid },
          notification: {
            title: `Invitation accepted for ${organization.name}`,
            body: `${acceptedEmail} joined as ${invitation.invited_role}.`,
            navigate: `${origin}/org-console`,
            tag: 'boxvault-invite-accepted',
          },
          type: 'ACCOUNT',
          severity: 'INFO',
          idempotencyKey: `boxvault:invite-accepted:${invitation.id}:user:${uuid}`,
        })
      )
    );
  } catch (err) {
    log.app.warn('Invitation-accepted notification skipped', { error: err.message });
  }
};

export { notifyInvitationAccepted };
