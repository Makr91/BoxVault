import { log } from './Logger.js';
import { broadcast, closeUserStreams } from './events.js';
import { getAuthServerUrl, extractOidcAccessToken } from '../controllers/favorites/helpers.js';

const FORWARDED_EVENTS = new Set([
  'notification-created',
  'notification-read',
  'notification-unread',
  'notification-dismissed',
  'inbox-read-all',
  'inbox-cleared',
  'unread-count',
]);

const RETRY_MS = 3000;
const RETRY_CAP_MS = 30000;
const STREAM_TYPE = 'text/event-stream';

const relays = new Map();

const contextOf = req => {
  const provider = req.authProvider || req.tokenClaims?.provider;
  if (typeof provider !== 'string' || !provider.startsWith('oidc-')) {
    return null;
  }
  const token = extractOidcAccessToken(req);
  const expiresAt = req.authProvider
    ? req.tokenClaims.exp * 1000
    : (req.oidcTokens || req.tokenClaims).oidc_expires_at;
  if (!token || !Number.isFinite(expiresAt)) {
    return null;
  }
  return { token, expiresAt, issuer: getAuthServerUrl(req) };
};

const freshest = (relay, after) => {
  let best = null;
  for (const context of relay.connections.values()) {
    if (
      !relay.spent.has(context.token) &&
      context.expiresAt > after &&
      (!best || context.expiresAt > best.expiresAt)
    ) {
      best = context;
    }
  }
  return best;
};

const dispatch = (relay, upstream) => {
  const { frame } = upstream;
  upstream.frame = {};
  if (frame.id !== undefined) {
    relay.lastEventId = frame.id;
  }
  if (frame.data === undefined) {
    return false;
  }
  if (frame.event === 'session-terminated') {
    return true;
  }
  if (!FORWARDED_EVENTS.has(frame.event)) {
    return false;
  }
  try {
    broadcast('notifications', frame.event, JSON.parse(frame.data), relay.userId);
  } catch (error) {
    log.app.warn('Notification relay frame unreadable', {
      userId: relay.userId,
      event: frame.event,
      error: error.message,
    });
  }
  return false;
};

const readLine = (relay, upstream, line) => {
  if (line === '') {
    return dispatch(relay, upstream);
  }
  if (line.startsWith(':')) {
    return false;
  }
  const colon = line.indexOf(':');
  const field = colon === -1 ? line : line.slice(0, colon);
  const raw = colon === -1 ? '' : line.slice(colon + 1);
  const value = raw.startsWith(' ') ? raw.slice(1) : raw;
  const { frame } = upstream;
  if (field === 'data') {
    frame.data = frame.data === undefined ? value : `${frame.data}\n${value}`;
  } else if (field === 'event') {
    frame.event = value;
  } else if (field === 'id' && !value.includes('\0')) {
    frame.id = value;
  } else if (field === 'retry' && /^\d+$/u.test(value)) {
    relay.retryMs = Number(value);
  }
  return false;
};

const parse = (relay, upstream, text) => {
  const lines = `${upstream.buffer}${text}`.split('\n');
  upstream.buffer = lines.pop();
  return lines.some(line =>
    readLine(relay, upstream, line.endsWith('\r') ? line.slice(0, -1) : line)
  );
};

const readStream = (relay, upstream, response) =>
  new Promise(resolve => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const next = () => {
      reader.read().then(
        ({ value, done }) => {
          if (relay.upstream !== upstream) {
            resolve('closed');
            return;
          }
          if (done) {
            resolve('completed');
            return;
          }
          if (parse(relay, upstream, decoder.decode(value, { stream: true }))) {
            resolve('terminated');
            return;
          }
          next();
        },
        error => {
          if (relay.upstream === upstream) {
            log.app.warn('Notification relay dropped', {
              userId: relay.userId,
              error: error.message,
            });
            resolve('dropped');
            return;
          }
          resolve('closed');
        }
      );
    };
    next();
  });

const discard = response => {
  response.body?.cancel().catch(error => {
    log.app.debug('Notification relay body discard failed', { error: error.message });
  });
};

const connect = async (relay, upstream) => {
  const { context } = upstream;
  const headers = { Accept: STREAM_TYPE, Authorization: `Bearer ${context.token}` };
  if (relay.lastEventId) {
    headers['Last-Event-ID'] = relay.lastEventId;
  }
  let response;
  try {
    response = await fetch(`${context.issuer}/api/events?topics=notifications`, {
      headers,
      signal: upstream.controller.signal,
    });
  } catch (error) {
    if (relay.upstream !== upstream) {
      return 'closed';
    }
    log.app.warn('Notification relay could not reach the identity provider', {
      userId: relay.userId,
      issuer: context.issuer,
      error: error.message,
    });
    return 'dropped';
  }
  if (relay.upstream !== upstream) {
    discard(response);
    return 'closed';
  }
  const { status } = response;
  if (status === 401 || status === 403) {
    discard(response);
    log.app.warn('Notification relay refused by the identity provider', {
      userId: relay.userId,
      status,
    });
    return 'refused';
  }
  if (status >= 500) {
    discard(response);
    log.app.warn('Notification relay answered by a failing identity provider', {
      userId: relay.userId,
      status,
    });
    return 'dropped';
  }
  if (status !== 200 || !(response.headers.get('content-type') || '').startsWith(STREAM_TYPE)) {
    discard(response);
    log.app.error('Notification relay answered without an event stream', {
      userId: relay.userId,
      status,
      contentType: response.headers.get('content-type'),
    });
    return 'stopped';
  }
  relay.attempt = 0;
  log.app.debug('Notification relay opened', {
    userId: relay.userId,
    issuer: context.issuer,
    resumed: Boolean(relay.lastEventId),
  });
  return readStream(relay, upstream, response);
};

const endStreams = relay => {
  relay.ending = true;
  log.app.info('Notification relay token spent, ending the streams to bring a fresh one', {
    userId: relay.userId,
  });
  closeUserStreams(relay.userId);
};

const run = (relay, after = Date.now()) => {
  const context = freshest(relay, after);
  if (!context) {
    return false;
  }
  const upstream = { controller: new AbortController(), context, buffer: '', frame: {} };
  relay.upstream = upstream;
  connect(relay, upstream).then(outcome => {
    if (relay.upstream !== upstream) {
      return;
    }
    relay.upstream = null;
    upstream.controller.abort();
    if (outcome === 'completed') {
      relay.spent.add(context.token);
      if (!run(relay, context.expiresAt)) {
        endStreams(relay);
      }
    } else if (outcome === 'refused') {
      relay.spent.add(context.token);
      run(relay);
    } else if (outcome === 'terminated') {
      relay.spent.add(context.token);
      log.app.info('Notification relay ended by the identity provider', { userId: relay.userId });
    } else if (outcome === 'dropped') {
      const delay = Math.min(relay.retryMs * 2 ** relay.attempt, RETRY_CAP_MS);
      relay.attempt += 1;
      relay.timer = setTimeout(() => {
        relay.timer = null;
        if (!run(relay)) {
          endStreams(relay);
        }
      }, delay);
      relay.timer.unref();
    }
  });
  return true;
};

const close = relay => {
  clearTimeout(relay.timer);
  relay.timer = null;
  if (relay.upstream) {
    const { controller } = relay.upstream;
    relay.upstream = null;
    controller.abort();
  }
  relays.delete(relay.userId);
  log.app.debug('Notification relay closed', { userId: relay.userId });
};

/**
 * Relay the identity provider's notifications topic to one person's BoxVault
 * streams while this connection is open: one upstream connection per person,
 * opened with the access token of theirs that expires latest, forwarding the
 * seven inbox events through broadcast and resuming with the issuer's last
 * frame id. A local-account session gets no relay.
 * @param {import('express').Request} req - The stream request, with the session resolved
 * @param {import('express').Response} res - The open stream response
 * @returns {void}
 */
const relayNotifications = (req, res) => {
  let context;
  try {
    context = contextOf(req);
  } catch (error) {
    log.app.warn('Notification relay not opened', { userId: req.userId, error: error.message });
    return;
  }
  if (!context) {
    return;
  }
  const relay = relays.get(req.userId) || {
    userId: req.userId,
    connections: new Map(),
    spent: new Set(),
    upstream: null,
    timer: null,
    attempt: 0,
    retryMs: RETRY_MS,
    lastEventId: null,
    ending: false,
  };
  relays.set(req.userId, relay);
  relay.connections.set(res, context);
  relay.ending = false;
  res.on('close', () => {
    relay.connections.delete(res);
    if (relay.connections.size === 0 && !relay.ending) {
      close(relay);
    }
  });
  if (!relay.upstream && !relay.timer) {
    run(relay);
  }
};

export { relayNotifications };
