import { log } from './Logger.js';

const RETRY_MS = 3000;
const HEARTBEAT_MS = 25000;
const RING_MAX_EVENTS = 500;
const RING_MAX_AGE_MS = 5 * 60 * 1000;

const TOPICS = ['session', 'notifications'];

const ring = [];
const subscribers = new Set();

let lastMs = 0;
let seq = 0;

const nextId = () => {
  const now = Math.max(Date.now(), lastMs);
  if (now === lastMs) {
    seq += 1;
  } else {
    lastMs = now;
    seq = 0;
  }
  return `${now}-${seq}`;
};

const floorId = nextId();

const parseId = id => {
  const [ms, sequence] = String(id).split('-');
  return [Number(ms), Number(sequence)];
};

const compareIds = (a, b) => {
  const [aMs, aSeq] = parseId(a);
  const [bMs, bSeq] = parseId(b);
  return aMs === bMs ? aSeq - bSeq : aMs - bMs;
};

const isValidId = id => parseId(id).every(Number.isFinite);

const oldestId = () => (ring.length ? ring[0].id : floorId);

const frame = (id, event, data) => `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const requestedTopics = query => {
  const requested = String(query || '')
    .split(',')
    .map(topic => topic.trim())
    .filter(topic => TOPICS.includes(topic));
  return new Set(requested.length ? requested : TOPICS);
};

const armHeartbeat = subscriber => {
  clearInterval(subscriber.heartbeat);
  subscriber.heartbeat = setInterval(() => {
    subscriber.res.write(':hb\n\n');
  }, HEARTBEAT_MS);
  subscriber.heartbeat.unref();
};

const write = (subscriber, text) => {
  try {
    subscriber.res.write(text);
    armHeartbeat(subscriber);
  } catch (err) {
    log.app.debug('Event stream write failed', { userId: subscriber.userId, error: err.message });
  }
};

const deliverable = (subscriber, entry) =>
  subscriber.topics.has(entry.topic) &&
  (entry.userId === null || entry.userId === subscriber.userId);

const trimRing = () => {
  const cutoff = Date.now() - RING_MAX_AGE_MS;
  while (ring.length > RING_MAX_EVENTS && ring[0].at < cutoff) {
    ring.shift();
  }
};

const replay = (subscriber, lastEventId) => {
  if (!lastEventId) {
    return;
  }
  if (!isValidId(lastEventId) || compareIds(lastEventId, oldestId()) < 0) {
    write(subscriber, frame(nextId(), 'reset', { topics: [...subscriber.topics] }));
    return;
  }
  for (const entry of ring) {
    if (compareIds(entry.id, lastEventId) > 0 && deliverable(subscriber, entry)) {
      write(subscriber, frame(entry.id, entry.event, entry.data));
    }
  }
};

/**
 * Answer GET /api/events for a signed-in caller: the stream headers, the
 * retry hint and the ready frame naming the subscribed topics, a replay of
 * everything after Last-Event-ID when it is still in the ring or a reset when
 * it is not, then live events and a heartbeat comment while idle.
 * @param {import('express').Request} req - The request, with userId resolved
 * @param {import('express').Response} res - The response kept open as the stream
 */
const openEventStream = (req, res) => {
  const topics = requestedTopics(req.query.topics);
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  req.setTimeout(0);
  res.setTimeout(0);

  const subscriber = { res, userId: req.userId, topics, heartbeat: null };
  subscribers.add(subscriber);
  res.on('close', () => {
    clearInterval(subscriber.heartbeat);
    subscribers.delete(subscriber);
  });

  const id = nextId();
  write(subscriber, `retry: ${RETRY_MS}\n${frame(id, 'ready', { id, topics: [...topics] })}`);
  replay(subscriber, req.headers['last-event-id']);
  log.app.debug('Event stream opened', { userId: req.userId, topics: [...topics] });
};

/**
 * Append one event to the ring and deliver it to every subscriber of its
 * topic, or only to the streams of one user.
 * @param {string} topic - The topic the event belongs to
 * @param {string} event - The kebab-case event name
 * @param {Object} data - The JSON object the event carries
 * @param {number|null} [userId] - The one user to deliver to, or null for everyone
 * @returns {number} The number of streams the event was written to
 */
const broadcast = (topic, event, data, userId = null) => {
  const entry = { id: nextId(), at: Date.now(), topic, event, data, userId };
  ring.push(entry);
  trimRing();
  let delivered = 0;
  for (const subscriber of subscribers) {
    if (deliverable(subscriber, entry)) {
      write(subscriber, frame(entry.id, event, data));
      delivered += 1;
    }
  }
  return delivered;
};

/**
 * Push session-terminated to every stream of a user and close them.
 * @param {number} userId - The user whose sessions were revoked
 */
const notifySessionTerminated = userId => {
  const delivered = broadcast('session', 'session-terminated', {}, userId);
  for (const subscriber of subscribers) {
    if (subscriber.userId === userId) {
      subscriber.res.end();
    }
  }
  log.auth.info('Session-terminated event pushed', { userId, connections: delivered });
};

/**
 * Push the hub's unread count to every stream of a user.
 * @param {number} userId - The user whose count changed
 * @param {number} count - The unread count
 */
const notifyUnreadCount = (userId, count) => {
  broadcast('notifications', 'unread-count', { count }, userId);
};

export { TOPICS, openEventStream, broadcast, notifySessionTerminated, notifyUnreadCount };
