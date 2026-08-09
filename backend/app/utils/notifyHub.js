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
const byteLength = value => Buffer.byteLength(value, 'utf8');

/**
 * Drop characters from the end until at least `excess` BYTES are gone.
 * Iterating code points rather than slicing by string length keeps this
 * honest for non-ASCII text — the budget is measured in bytes, so trimming
 * that many string positions would cut two to four times too much and can
 * split a surrogate pair in half.
 * @param {string} text - Body text
 * @param {number} excess - Bytes that must be removed
 * @returns {string} Trimmed text with an ellipsis
 */
const trimByBytes = (text, excess) => {
  const characters = [...text.replace(/…$/, '')];
  let removed = 0;
  let kept = characters.length;

  while (kept > 0 && removed < excess) {
    kept -= 1;
    removed += byteLength(characters[kept]);
  }
  return `${characters.slice(0, kept).join('')}…`;
};

/**
 * Shorten a body that is either a plain string or a per-language map, keeping
 * the two contract forms interchangeable everywhere else. Only the longest
 * variant of a map is trimmed per pass: the overage is shared across the whole
 * map, so charging every language the full excess would gut short translations
 * that were never the problem.
 * @param {string|Object} body - Notification body in either contract form
 * @param {number} excess - Bytes over budget
 * @returns {string|Object} The shortened body
 */
const shortenBody = (body, excess) => {
  if (typeof body === 'string') {
    return trimByBytes(body, excess);
  }

  const entries = Object.entries(body).filter(([, text]) => typeof text === 'string');
  if (entries.length === 0) {
    return body;
  }

  const [longest] = entries.reduce((a, b) => (byteLength(a[1]) >= byteLength(b[1]) ? a : b));
  return { ...body, [longest]: trimByBytes(body[longest], excess) };
};

const serializeWithinBudget = payload => {
  const bounded = { ...payload, notification: { ...payload.notification } };
  let serialized = JSON.stringify(bounded);
  let excess = byteLength(serialized) - MAX_PAYLOAD_BYTES;
  const { body } = bounded.notification;
  const shortenable = typeof body === 'string' || (body && typeof body === 'object');

  while (excess > 0 && shortenable) {
    const previousLength = serialized.length;
    bounded.notification.body = shortenBody(bounded.notification.body, excess);
    serialized = JSON.stringify(bounded);
    excess = byteLength(serialized) - MAX_PAYLOAD_BYTES;

    // Nothing left to give — stop rather than spin.
    if (serialized.length >= previousLength) {
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
