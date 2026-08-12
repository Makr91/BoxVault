import { log } from './Logger.js';

const HEARTBEAT_MS = 25000;

const streams = new Map();

const registerSessionStream = (userId, res) => {
  if (!streams.has(userId)) {
    streams.set(userId, new Set());
  }
  streams.get(userId).add(res);

  const heartbeat = setInterval(() => {
    res.write(':\n\n');
  }, HEARTBEAT_MS);
  heartbeat.unref();

  res.on('close', () => {
    clearInterval(heartbeat);
    const connections = streams.get(userId);
    if (connections) {
      connections.delete(res);
      if (!connections.size) {
        streams.delete(userId);
      }
    }
  });
};

const openSessionEventStream = (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  res.write(':\n\n');
  req.setTimeout(0);
  res.setTimeout(0);
  registerSessionStream(req.userId, res);
};

const notifySessionTerminated = userId => {
  const connections = streams.get(userId);
  if (!connections) {
    return;
  }
  const count = connections.size;
  for (const res of connections) {
    try {
      res.write('event: session-terminated\ndata: {}\n\n');
      res.end();
    } catch (err) {
      log.auth.debug('Session event write failed', { userId, error: err.message });
    }
  }
  streams.delete(userId);
  log.auth.info('Session-terminated event pushed', { userId, connections: count });
};

export { openSessionEventStream, notifySessionTerminated };
