import request from 'supertest';
import { createServer } from 'http';
import app from '../server.js';
import db from '../app/models/index.js';
import jwt from 'jsonwebtoken';
import { notifySessionTerminated, notifyUnreadCount } from '../app/utils/events.js';

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };
const STREAM_TYPE = 'text/event-stream';

const parseFrames = text => {
  const blocks = text.split('\n\n');
  blocks.pop();
  return blocks
    .map(block => {
      const frame = {};
      for (const line of block.split('\n')) {
        const colon = line.indexOf(': ');
        if (colon > 0) {
          frame[line.slice(0, colon)] = line.slice(colon + 2);
        }
      }
      return frame;
    })
    .filter(frame => frame.event)
    .map(frame => ({ ...frame, data: JSON.parse(frame.data) }));
};

const idValue = id => id.split('-').map(Number);

const laterThan = (id, than) => {
  const [ms, seq] = idValue(id);
  const [thanMs, thanSeq] = idValue(than);
  return ms > thanMs || (ms === thanMs && seq > thanSeq);
};

describe('Events API', () => {
  let server;
  let baseUrl;
  let user;
  let other;
  let userToken;
  let otherToken;
  let serviceToken;
  const uniqueId = Date.now();

  const signFor = (account, claims = {}) =>
    jwt.sign({ id: account.id, ...claims }, 'test-secret', { expiresIn: '1h', ...TEST_JWT_CLAIMS });

  const openStream = async ({ headers = {}, query = '' } = {}) => {
    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/api/events${query}`, {
      headers: { Accept: STREAM_TYPE, ...headers },
      signal: controller.signal,
    });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith(STREAM_TYPE)) {
      const body = await response.json();
      return { status: response.status, body, close: () => controller.abort() };
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let ended = false;
    const frames = () => parseFrames(text);
    const readUntil = async count => {
      if (ended || frames().length >= count) {
        return frames();
      }
      const { value, done } = await reader.read();
      if (done) {
        ended = true;
        return frames();
      }
      text += decoder.decode(value, { stream: true });
      return readUntil(count);
    };
    await readUntil(1);
    return {
      status: response.status,
      headers: response.headers,
      frames,
      readUntil,
      ended: () => ended,
      close: () => controller.abort(),
    };
  };

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    server = createServer(app);
    await new Promise(resolve => {
      server.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const userRole = await db.role.findOne({ where: { name: 'user' } });
    user = await db.user.create({
      username: `eventsuser_${uniqueId}`,
      email: `eventsuser_${uniqueId}@example.com`,
      password: 'password',
      verified: true,
    });
    await user.setRoles([userRole]);
    userToken = signFor(user);

    other = await db.user.create({
      username: `eventsother_${uniqueId}`,
      email: `eventsother_${uniqueId}@example.com`,
      password: 'password',
      verified: true,
    });
    await other.setRoles([userRole]);
    otherToken = signFor(other);

    serviceToken = signFor(user, { isServiceAccount: true });
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise(resolve => {
      server.close(resolve);
    });
    await user.destroy();
    await other.destroy();
  });

  describe('GET /api/status', () => {
    it('should advertise the stream, its topics and the config names', async () => {
      const res = await request(app).get('/api/status');
      expect(res.statusCode).toBe(200);
      expect(res.body.features).toContain('events');
      expect(res.body.events).toEqual({
        path: '/api/events',
        topics: ['session', 'notifications'],
      });
      expect(res.body.config).toEqual(['app', 'auth', 'db', 'mail']);
    });
  });

  describe('GET /api/events', () => {
    it('should answer 401 without a session', async () => {
      const stream = await openStream();
      expect(stream.status).toBe(401);
      expect(stream.body.error).toBe('TOKEN_INVALID');
    });

    it('should answer 401 to an invalid session', async () => {
      const stream = await openStream({ headers: { 'x-access-token': 'not.a.token' } });
      expect(stream.status).toBe(401);
    });

    it('should answer 403 to a service account', async () => {
      const stream = await openStream({ headers: { 'x-access-token': serviceToken } });
      expect(stream.status).toBe(403);
    });

    it('should open with the stream headers, the retry hint and the ready frame', async () => {
      const stream = await openStream({
        headers: { 'x-access-token': userToken },
        query: '?topics=session,notifications',
      });
      expect(stream.status).toBe(200);
      expect(stream.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
      expect(stream.headers.get('cache-control')).toBe('no-cache, no-transform');
      expect(stream.headers.get('x-accel-buffering')).toBe('no');
      const [ready] = stream.frames();
      expect(ready.retry).toBe('3000');
      expect(ready.event).toBe('ready');
      expect(ready.id).toMatch(/^\d+-\d+$/);
      expect(ready.data).toEqual({ id: ready.id, topics: ['session', 'notifications'] });
      stream.close();
    });

    it('should ignore unknown topics and subscribe every core topic to an empty list', async () => {
      const partial = await openStream({
        headers: { 'x-access-token': userToken },
        query: '?topics=bogus,notifications',
      });
      expect(partial.frames()[0].data.topics).toEqual(['notifications']);
      partial.close();

      const empty = await openStream({ headers: { 'x-access-token': userToken } });
      expect(empty.frames()[0].data.topics).toEqual(['session', 'notifications']);
      empty.close();
    });

    it('should deliver a broadcast to the user it names and to nobody else', async () => {
      const mine = await openStream({ headers: { 'x-access-token': userToken } });
      const theirs = await openStream({ headers: { 'x-access-token': otherToken } });

      notifyUnreadCount(user.id, 3);
      const frames = await mine.readUntil(2);
      expect(frames[1].event).toBe('unread-count');
      expect(frames[1].data).toEqual({ count: 3 });
      expect(laterThan(frames[1].id, frames[0].id)).toBe(true);

      notifyUnreadCount(other.id, 1);
      const otherFrames = await theirs.readUntil(2);
      expect(otherFrames[1].data).toEqual({ count: 1 });
      expect(mine.frames()).toHaveLength(2);

      mine.close();
      theirs.close();
    });

    it('should replay everything after Last-Event-ID in order, filtered to the caller', async () => {
      const first = await openStream({ headers: { 'x-access-token': userToken } });
      const [ready] = first.frames();
      first.close();

      notifyUnreadCount(user.id, 4);
      notifyUnreadCount(other.id, 9);
      notifyUnreadCount(user.id, 5);

      const resumed = await openStream({
        headers: { 'x-access-token': userToken, 'Last-Event-ID': ready.id },
        query: '?topics=notifications',
      });
      const frames = await resumed.readUntil(3);
      expect(frames.map(frame => frame.event)).toEqual(['ready', 'unread-count', 'unread-count']);
      expect(frames.map(frame => frame.data.count)).toEqual([undefined, 4, 5]);
      expect(frames.every(frame => laterThan(frame.id, ready.id))).toBe(true);

      notifyUnreadCount(user.id, 6);
      const live = await resumed.readUntil(4);
      expect(live[3].data).toEqual({ count: 6 });
      resumed.close();
    });

    it('should answer reset when Last-Event-ID is outside the ring', async () => {
      const stream = await openStream({
        headers: { 'x-access-token': userToken, 'Last-Event-ID': '1-0' },
        query: '?topics=notifications',
      });
      const frames = await stream.readUntil(2);
      expect(frames[0].event).toBe('ready');
      expect(frames[1].event).toBe('reset');
      expect(frames[1].data).toEqual({ topics: ['notifications'] });
      stream.close();

      const garbled = await openStream({
        headers: { 'x-access-token': userToken, 'Last-Event-ID': 'nonsense' },
      });
      const garbledFrames = await garbled.readUntil(2);
      expect(garbledFrames[1].event).toBe('reset');
      garbled.close();
    });

    it('should push session-terminated to the user and close the stream', async () => {
      const stream = await openStream({ headers: { 'x-access-token': userToken } });
      const bystander = await openStream({ headers: { 'x-access-token': otherToken } });

      notifySessionTerminated(user.id);
      const frames = await stream.readUntil(3);
      expect(frames).toHaveLength(2);
      expect(frames[1].event).toBe('session-terminated');
      expect(frames[1].data).toEqual({});
      expect(stream.ended()).toBe(true);

      notifyUnreadCount(other.id, 2);
      const otherFrames = await bystander.readUntil(2);
      expect(otherFrames.map(frame => frame.event)).toEqual(['ready', 'unread-count']);
      bystander.close();
    });
  });
});
