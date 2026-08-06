// notifyHub.js — fire-and-forget producer for the auth server's notification
// hub. BoxVault POSTs {issuer}/api/notify with a client_credentials token
// (scope notifications:write) minted for the shared boxvault_s2s client.
// Delivery is best-effort: failures are logged and NEVER thrown to callers,
// and the whole feature no-ops until the auth.oidc.notifications_enabled knob
// is turned on (the IdP grants the scope out-of-band).
import axios from 'axios';
import { loadConfig } from './config-loader.js';
import { log } from './Logger.js';
import { getS2sToken } from './externalInvites.js';

const NOTIFY_SCOPE = 'notifications:write';

// Hub contract: the serialized JSON payload must stay at or under this size.
const MAX_PAYLOAD_BYTES = 3800;

/**
 * Serialize a hub payload, truncating notification.body (with an ellipsis)
 * until the JSON stays within the hub's byte budget. The payload's
 * notification object is replaced, never mutated in place for the caller.
 * @param {Object} payload - Full hub payload ({ recipient, notification, ... })
 * @returns {string} JSON string at or under MAX_PAYLOAD_BYTES (best effort)
 */
const serializeWithinBudget = payload => {
  const bounded = { ...payload, notification: { ...payload.notification } };
  let serialized = JSON.stringify(bounded);
  let excess = Buffer.byteLength(serialized, 'utf8') - MAX_PAYLOAD_BYTES;

  while (excess > 0 && typeof bounded.notification.body === 'string') {
    const { body } = bounded.notification;
    const keep = Math.max(0, body.replace(/…$/, '').length - excess);
    bounded.notification.body = `${body.slice(0, keep)}…`;
    serialized = JSON.stringify(bounded);
    excess = Buffer.byteLength(serialized, 'utf8') - MAX_PAYLOAD_BYTES;
    if (keep === 0) {
      break;
    }
  }
  return serialized;
};

/**
 * Send one notification through the auth server's hub. Fire-and-forget: this
 * never throws — hub errors (RFC 9457 problem+json) are logged with their
 * status and problem type, and the function is a debug-logged no-op while the
 * auth.oidc.notifications_enabled knob is off.
 * @param {Object} params
 * @param {string} params.issuer - The org's external_issuer (hub base URL)
 * @param {Object} params.recipient - { user_uuid } or { org_uuid, roles: [...] }
 * @param {Object} params.notification - WHATWG options dictionary
 *   ({ title, body, navigate, tag, icon?, data?, actions? })
 * @param {string} params.type - Hub notification type (e.g. SYSTEM)
 * @param {string} params.severity - Hub severity (e.g. INFO, WARNING)
 * @param {Object} [params.delivery] - { ttl, urgency }; defaults to
 *   { ttl: 86400, urgency: 'normal' }
 * @param {string} params.idempotencyKey - Stable per-event key for replays
 * @returns {Promise<void>}
 */
const sendHubNotification = async ({
  issuer,
  recipient,
  notification,
  type,
  severity,
  delivery = { ttl: 86400, urgency: 'normal' },
  idempotencyKey,
}) => {
  try {
    const authConfig = loadConfig('auth');
    if (!authConfig.auth?.oidc?.notifications_enabled?.value) {
      log.app.debug('Hub notifications disabled; skipping', { idempotencyKey });
      return;
    }

    const token = await getS2sToken(issuer, NOTIFY_SCOPE);
    const body = serializeWithinBudget({
      recipient,
      notification,
      type,
      severity,
      delivery,
      idempotencyKey,
    });

    const response = await axios.post(`${issuer.replace(/\/+$/, '')}/api/notify`, body, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });

    // 201 = delivered to N recipients, 200 = idempotent replay
    log.app.info('Hub notification accepted', {
      idempotencyKey,
      status: response.status,
      replay: response.status === 200,
      recipients: response.data?.recipients,
    });
  } catch (err) {
    // Errors are RFC 9457 problem+json — log status + problem type, never throw
    log.app.warn('Hub notification failed', {
      idempotencyKey,
      status: err.response?.status,
      problemType: err.response?.data?.type,
      error: err.message,
    });
  }
};

export { sendHubNotification };
