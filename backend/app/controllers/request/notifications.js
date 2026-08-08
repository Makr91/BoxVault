import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import { sendHubNotification } from '../../utils/notifyHub.js';
import { resolveOrgManagerRecipients } from '../../utils/notifyRecipients.js';

const notifyJoinRequestCreated = async (organization, requester, requestId) => {
  try {
    const origin = loadConfig('app').boxvault.origin.value;
    const notification = {
      title: `Join request for ${organization.name}`,
      body: `${requester.username} (${requester.email}) requested to join.`,
      navigate: `${origin}/org-console`,
      tag: 'boxvault-join-request',
    };

    if (organization.external_issuer && organization.external_org_id) {
      await sendHubNotification({
        issuer: organization.external_issuer,
        recipient: { org_uuid: organization.external_org_id, roles: ['owner', 'admin'] },
        notification,
        type: 'ACCOUNT',
        severity: 'INFO',
        idempotencyKey: `boxvault:join-request:${organization.external_org_id}:${requestId}`,
      });
      return;
    }

    const recipients = await resolveOrgManagerRecipients(organization.id);
    await Promise.all(
      recipients.map(({ issuer, uuid }) =>
        sendHubNotification({
          issuer,
          recipient: { user_uuid: uuid },
          notification,
          type: 'ACCOUNT',
          severity: 'INFO',
          idempotencyKey: `boxvault:join-request:${organization.name}:${requestId}:user:${uuid}`,
        })
      )
    );
  } catch (err) {
    log.app.warn('Join-request notification skipped', { error: err.message });
  }
};

export { notifyJoinRequestCreated };
