import { jest } from '@jest/globals';
import { createServer } from 'http';
import fs from 'fs';
import yaml from 'js-yaml';
import jwt from 'jsonwebtoken';
import { getConfigPath, reloadConfig } from '../app/utils/config-loader.js';

jest.unstable_mockModule('openid-client', () => ({
  discovery: server =>
    Promise.resolve({
      serverMetadata: () => ({ token_endpoint: new URL('/oauth2/token', server).href }),
    }),
  ClientSecretBasic: jest.fn(),
  ClientSecretPost: jest.fn(),
  None: jest.fn(),
  calculatePKCECodeChallenge: jest.fn(),
  buildAuthorizationUrl: jest.fn(),
  authorizationCodeGrant: jest.fn(),
  buildEndSessionUrl: jest.fn(),
  randomState: jest.fn(),
  randomPKCECodeVerifier: jest.fn(),
}));

const request = (await import('supertest')).default;
const app = (await import('../server.js')).default;
const db = (await import('../app/models/index.js')).default;
const { initializeStrategies } = await import('../app/auth/passport.js');
const { broadcast, notifyHealth, notifyProfileUpdated, notifySessionTerminated } =
  await import('../app/utils/events.js');

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };
const STREAM_TYPE = 'text/event-stream';
const HOUR_MS = 60 * 60 * 1000;

const INBOX_EVENTS = [
  ['notification-created', { id: 41, title: 'Box published', read: false }],
  ['notification-read', { id: 41, read_at: '2026-10-07T00:00:00Z' }],
  ['notification-unread', { id: 41 }],
  ['notification-dismissed', { id: 41 }],
  ['inbox-read-all', { read_at: '2026-10-07T00:01:00Z' }],
  ['inbox-cleared', {}],
  ['unread-count', { count: 0 }],
];

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

const updateConfig = async (configName, mutate) => {
  const configPath = getConfigPath(configName);
  const original = fs.readFileSync(configPath, 'utf8');
  const config = yaml.load(original);
  mutate(config);
  fs.writeFileSync(configPath, yaml.dump(config));
  await reloadConfig();
  return async () => {
    fs.writeFileSync(configPath, original);
    await reloadConfig();
  };
};

const upstreamFrame = (event, data, id) =>
  `${id ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const startIssuer = async () => {
  const issuer = { requests: [], waiters: [], tokenRequests: [], refuse: 0, retry: 3000 };
  const answerToken = (req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      const params = new URLSearchParams(body);
      issuer.tokenRequests.push(params);
      const refreshToken = params.get('refresh_token');
      if (refreshToken.startsWith('dead')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_grant' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          access_token: `fresh-${refreshToken}`,
          expires_in: 3600,
          refresh_token: `next-${refreshToken}`,
        })
      );
    });
  };
  issuer.server = createServer((req, res) => {
    if (req.url === '/oauth2/token') {
      answerToken(req, res);
      return;
    }
    const entry = {
      url: req.url,
      headers: req.headers,
      res,
      closed: new Promise(resolve => {
        res.on('close', resolve);
      }),
    };
    issuer.requests.push(entry);
    if (issuer.refuse > 0) {
      issuer.refuse -= 1;
      res.writeHead(401, { 'Content-Type': 'application/problem+json' });
      res.end(JSON.stringify({ status: 401 }));
    } else {
      res.writeHead(200, { 'Content-Type': `${STREAM_TYPE}; charset=utf-8` });
      res.write(
        `retry: ${issuer.retry}\n${upstreamFrame('ready', { id: 'up-0', topics: ['session', 'notifications', 'health', 'profile'] }, 'up-0')}`
      );
    }
    const ready = issuer.waiters.filter(waiter => waiter.index < issuer.requests.length);
    issuer.waiters = issuer.waiters.filter(waiter => waiter.index >= issuer.requests.length);
    ready.forEach(waiter => waiter.resolve(issuer.requests[waiter.index]));
  });
  await new Promise(resolve => {
    issuer.server.listen(0, '127.0.0.1', resolve);
  });
  issuer.url = `http://127.0.0.1:${issuer.server.address().port}`;
  issuer.requestAt = index =>
    index < issuer.requests.length
      ? Promise.resolve(issuer.requests[index])
      : new Promise(resolve => {
          issuer.waiters.push({ index, resolve });
        });
  return issuer;
};

describe('Events API', () => {
  let server;
  let baseUrl;
  let userRole;
  let user;
  let other;
  let userToken;
  let otherToken;
  let serviceToken;
  const people = [];
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
      return {
        status: response.status,
        headers: response.headers,
        body,
        close: () => controller.abort(),
      };
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

  const createPerson = async label => {
    const account = await db.user.create({
      username: `events${label}_${uniqueId}`,
      email: `events${label}_${uniqueId}@example.com`,
      password: 'password',
      verified: true,
    });
    await account.setRoles([userRole]);
    people.push(account);
    return account;
  };

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    server = createServer(app);
    await new Promise(resolve => {
      server.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    userRole = await db.role.findOne({ where: { name: 'user' } });
    user = await createPerson('user');
    userToken = signFor(user);
    other = await createPerson('other');
    otherToken = signFor(other);

    serviceToken = signFor(user, { is_service_account: true });
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise(resolve => {
      server.close(resolve);
    });
    await Promise.all(people.map(account => account.destroy()));
  });

  describe('GET /api/status', () => {
    it('should advertise the stream, its topics and the config names', async () => {
      const res = await request(app).get('/api/status');
      expect(res.statusCode).toBe(200);
      expect(res.body.features).toContain('events');
      expect(res.body.events).toEqual({
        path: '/api/events',
        topics: ['session', 'notifications', 'health', 'profile'],
      });
      expect(res.body.config).toEqual(['app', 'auth', 'db', 'mail']);
    });
  });

  describe('GET /api/events', () => {
    it('should answer 401 without a session', async () => {
      const stream = await openStream();
      expect(stream.status).toBe(401);
      expect(stream.headers.get('www-authenticate')).toBe('Bearer');
      expect(stream.body.type).toBe('https://auth.startcloud.com/probs/authentication');
      expect(stream.body.title).toBe('Unauthorized!');
    });

    it('should answer 401 to an invalid session', async () => {
      const stream = await openStream({ headers: { 'x-access-token': 'not.a.token' } });
      expect(stream.status).toBe(401);
    });

    it('should answer 403 to a service account', async () => {
      const stream = await openStream({ headers: { 'x-access-token': serviceToken } });
      expect(stream.status).toBe(403);
      expect(stream.headers.get('www-authenticate')).toBeNull();
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
      expect(empty.frames()[0].data.topics).toEqual([
        'session',
        'notifications',
        'health',
        'profile',
      ]);
      empty.close();
    });

    it('should deliver profile-updated to the person whose record changed and to nobody else', async () => {
      const mine = await openStream({
        headers: { 'x-access-token': userToken },
        query: '?topics=profile',
      });
      const theirs = await openStream({ headers: { 'x-access-token': otherToken } });

      notifyProfileUpdated(user.id);
      const frames = await mine.readUntil(2);
      expect(frames[1].event).toBe('profile-updated');
      expect(frames[1].data).toEqual({});
      expect(theirs.frames()).toHaveLength(1);

      const patched = await request(app)
        .patch('/api/user/preferences')
        .set('x-access-token', otherToken)
        .send({ motion: 'reduce' });
      expect(patched.statusCode).toBe(200);
      const otherFrames = await theirs.readUntil(2);
      expect(otherFrames[1].event).toBe('profile-updated');
      expect(mine.frames()).toHaveLength(2);

      mine.close();
      theirs.close();
    });

    it('should deliver a health event to every subscriber of the topic', async () => {
      const mine = await openStream({
        headers: { 'x-access-token': userToken },
        query: '?topics=health',
      });
      const theirs = await openStream({ headers: { 'x-access-token': otherToken } });
      const health = {
        status: 'warning',
        timestamp: '2026-09-07T00:00:00.000Z',
        services: { database: 'ok', storage_boxes: 'Warning', storage_isos: 'Good' },
      };

      notifyHealth(health);
      const frames = await mine.readUntil(2);
      expect(frames[1].event).toBe('health');
      expect(frames[1].data).toEqual(health);
      const otherFrames = await theirs.readUntil(2);
      expect(otherFrames[1].event).toBe('health');
      expect(otherFrames[1].data).toEqual(health);

      mine.close();
      theirs.close();
    });

    it('should deliver a broadcast to the user it names and to nobody else', async () => {
      const mine = await openStream({ headers: { 'x-access-token': userToken } });
      const theirs = await openStream({ headers: { 'x-access-token': otherToken } });

      broadcast('notifications', 'unread-count', { count: 3 }, user.id);
      const frames = await mine.readUntil(2);
      expect(frames[1].event).toBe('unread-count');
      expect(frames[1].data).toEqual({ count: 3 });
      expect(laterThan(frames[1].id, frames[0].id)).toBe(true);

      broadcast('notifications', 'unread-count', { count: 1 }, other.id);
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

      broadcast('notifications', 'unread-count', { count: 4 }, user.id);
      broadcast('notifications', 'unread-count', { count: 9 }, other.id);
      broadcast('notifications', 'unread-count', { count: 5 }, user.id);

      const resumed = await openStream({
        headers: { 'x-access-token': userToken, 'Last-Event-ID': ready.id },
        query: '?topics=notifications',
      });
      const frames = await resumed.readUntil(3);
      expect(frames.map(frame => frame.event)).toEqual(['ready', 'unread-count', 'unread-count']);
      expect(frames.map(frame => frame.data.count)).toEqual([undefined, 4, 5]);
      expect(frames.every(frame => laterThan(frame.id, ready.id))).toBe(true);

      broadcast('notifications', 'unread-count', { count: 6 }, user.id);
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

      const future = await openStream({
        headers: { 'x-access-token': userToken, 'Last-Event-ID': `${Date.now() + 3600000}-0` },
      });
      const futureFrames = await future.readUntil(2);
      expect(futureFrames[1].event).toBe('reset');
      future.close();
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

      broadcast('notifications', 'unread-count', { count: 2 }, other.id);
      const otherFrames = await bystander.readUntil(2);
      expect(otherFrames.map(frame => frame.event)).toEqual(['ready', 'unread-count']);
      bystander.close();
    });
  });

  describe('the notification relay', () => {
    let issuer;
    let restoreAuth;

    const sessionFor = (account, claims = {}) =>
      signFor(account, {
        provider: 'oidc-fakeidp',
        oidc_access_token: `idp-${account.id}`,
        oidc_expires_at: Date.now() + HOUR_MS,
        ...claims,
      });

    const openRelayed = token =>
      openStream({ headers: { 'x-access-token': token }, query: '?topics=session,notifications' });

    beforeAll(async () => {
      issuer = await startIssuer();
      restoreAuth = await updateConfig('auth', config => {
        config.auth.oidc.providers = {
          fakeidp: {
            enabled: true,
            issuer: issuer.url,
            client_id: 'boxvault',
            client_secret: 'boxvault-secret',
          },
        };
      });
      await initializeStrategies();
    });

    afterAll(async () => {
      await restoreAuth();
      issuer.server.closeAllConnections();
      await new Promise(resolve => {
        issuer.server.close(resolve);
      });
    });

    beforeEach(() => {
      issuer.requests = [];
      issuer.waiters = [];
      issuer.tokenRequests = [];
      issuer.refuse = 0;
      issuer.retry = 3000;
    });

    it('should forward the seven inbox events to the person alone, and nothing else', async () => {
      const person = await createPerson('relayseven');
      const bystander = await createPerson('relaybystander');
      const mine = await openRelayed(sessionFor(person));
      const theirs = await openStream({
        headers: { 'x-access-token': signFor(bystander) },
        query: '?topics=notifications,profile',
      });

      const upstream = await issuer.requestAt(0);
      expect(upstream.url).toBe('/api/events?topics=notifications');
      expect(upstream.headers.authorization).toBe(`Bearer idp-${person.id}`);
      expect(upstream.headers.accept).toBe(STREAM_TYPE);
      expect(upstream.headers['last-event-id']).toBeUndefined();

      upstream.res.write(upstreamFrame('health', { status: 'ok' }, 'up-1'));
      upstream.res.write(upstreamFrame('profile-updated', {}, 'up-2'));
      upstream.res.write(upstreamFrame('reset', { topics: ['notifications'] }, 'up-3'));
      upstream.res.write(':hb\n\n');
      INBOX_EVENTS.forEach(([event, data], index) => {
        upstream.res.write(upstreamFrame(event, data, `up-${index + 4}`));
      });

      const frames = await mine.readUntil(INBOX_EVENTS.length + 1);
      expect(frames.slice(1).map(frame => [frame.event, frame.data])).toEqual(INBOX_EVENTS);
      expect(frames.slice(1).every(frame => laterThan(frame.id, frames[0].id))).toBe(true);

      notifyProfileUpdated(bystander.id);
      const theirFrames = await theirs.readUntil(2);
      expect(theirFrames.map(frame => frame.event)).toEqual(['ready', 'profile-updated']);

      theirs.close();
      mine.close();
      await upstream.closed;
    });

    it('should hold one upstream per person and close it with the last stream', async () => {
      const person = await createPerson('relayshared');
      const token = sessionFor(person);
      const first = await openRelayed(token);
      const upstream = await issuer.requestAt(0);
      const second = await openRelayed(token);

      upstream.res.write(upstreamFrame('unread-count', { count: 2 }, 'up-1'));
      expect((await first.readUntil(2))[1].data).toEqual({ count: 2 });
      expect((await second.readUntil(2))[1].data).toEqual({ count: 2 });
      expect(issuer.requests).toHaveLength(1);

      first.close();
      upstream.res.write(upstreamFrame('unread-count', { count: 3 }, 'up-2'));
      expect((await second.readUntil(3))[2].data).toEqual({ count: 3 });

      second.close();
      await upstream.closed;
    });

    it('should end the person streams when the upstream completes and resume with the issuer id', async () => {
      const person = await createPerson('relayexpiry');
      const stream = await openRelayed(sessionFor(person));
      const upstream = await issuer.requestAt(0);

      upstream.res.write(upstreamFrame('unread-count', { count: 1 }, 'up-7'));
      expect((await stream.readUntil(2))[1].event).toBe('unread-count');
      upstream.res.end();

      const frames = await stream.readUntil(Number.MAX_SAFE_INTEGER);
      expect(stream.ended()).toBe(true);
      expect(frames.map(frame => frame.event)).toEqual(['ready', 'unread-count']);

      const resumed = await openRelayed(
        sessionFor(person, { oidc_access_token: `idp-${person.id}-renewed` })
      );
      const reopened = await issuer.requestAt(1);
      expect(reopened.headers.authorization).toBe(`Bearer idp-${person.id}-renewed`);
      expect(reopened.headers['last-event-id']).toBe('up-7');

      resumed.close();
      await reopened.closed;
    });

    it('should forget a relay whose streams never came back once someone else connects', async () => {
      const person = await createPerson('relayabandoned');
      const passerby = await createPerson('relaypasserby');
      const stream = await openRelayed(sessionFor(person));
      const upstream = await issuer.requestAt(0);

      upstream.res.write(upstreamFrame('unread-count', { count: 1 }, 'up-5'));
      await stream.readUntil(2);
      upstream.res.end();
      await stream.readUntil(Number.MAX_SAFE_INTEGER);
      expect(stream.ended()).toBe(true);

      const elsewhere = await openRelayed(sessionFor(passerby));
      const passing = await issuer.requestAt(1);
      expect(passing.headers.authorization).toBe(`Bearer idp-${passerby.id}`);

      const back = await openRelayed(
        sessionFor(person, { oidc_access_token: `idp-${person.id}-back` })
      );
      const reopened = await issuer.requestAt(2);
      expect(reopened.headers.authorization).toBe(`Bearer idp-${person.id}-back`);
      expect(reopened.headers['last-event-id']).toBeUndefined();

      elsewhere.close();
      back.close();
      await passing.closed;
      await reopened.closed;
    });

    it('should reopen with a later-expiring token instead of ending the streams', async () => {
      const person = await createPerson('relayhandover');
      const early = await openRelayed(
        sessionFor(person, {
          oidc_access_token: `idp-${person.id}-early`,
          oidc_expires_at: Date.now() + HOUR_MS / 2,
        })
      );
      const upstream = await issuer.requestAt(0);
      expect(upstream.headers.authorization).toBe(`Bearer idp-${person.id}-early`);
      const late = await openRelayed(
        sessionFor(person, { oidc_access_token: `idp-${person.id}-late` })
      );

      upstream.res.write(upstreamFrame('unread-count', { count: 5 }, 'up-3'));
      await early.readUntil(2);
      await late.readUntil(2);
      upstream.res.end();

      const reopened = await issuer.requestAt(1);
      expect(reopened.headers.authorization).toBe(`Bearer idp-${person.id}-late`);
      expect(reopened.headers['last-event-id']).toBe('up-3');

      reopened.res.write(upstreamFrame('unread-count', { count: 6 }, 'up-4'));
      expect((await early.readUntil(3))[2].data).toEqual({ count: 6 });
      expect((await late.readUntil(3))[2].data).toEqual({ count: 6 });
      expect(early.ended()).toBe(false);

      early.close();
      late.close();
      await reopened.closed;
    });

    it('should reconnect after a dropped upstream with Last-Event-ID', async () => {
      issuer.retry = 1;
      const person = await createPerson('relaydrop');
      const stream = await openRelayed(sessionFor(person));
      const upstream = await issuer.requestAt(0);

      upstream.res.write(upstreamFrame('unread-count', { count: 8 }, 'up-9'));
      await stream.readUntil(2);
      upstream.res.socket.destroy();

      const reopened = await issuer.requestAt(1);
      expect(reopened.headers.authorization).toBe(`Bearer idp-${person.id}`);
      expect(reopened.headers['last-event-id']).toBe('up-9');
      expect(stream.ended()).toBe(false);

      stream.close();
      await reopened.closed;
    });

    it('should close the upstream on session-terminated and never reopen it with that token', async () => {
      const person = await createPerson('relayterminated');
      const token = sessionFor(person);
      const stream = await openRelayed(token);
      const upstream = await issuer.requestAt(0);

      upstream.res.write(upstreamFrame('session-terminated', {}, 'up-1'));
      await upstream.closed;

      const again = await openRelayed(token);
      const renewed = await openRelayed(
        sessionFor(person, { oidc_access_token: `idp-${person.id}-renewed` })
      );
      const reopened = await issuer.requestAt(1);
      expect(reopened.headers.authorization).toBe(`Bearer idp-${person.id}-renewed`);

      broadcast('notifications', 'unread-count', { count: 0 }, person.id);
      const frames = await stream.readUntil(2);
      expect(frames.map(frame => frame.event)).toEqual(['ready', 'unread-count']);

      stream.close();
      again.close();
      renewed.close();
      await reopened.closed;
    });

    it('should not retry a token the identity provider refuses', async () => {
      issuer.refuse = 1;
      const person = await createPerson('relayrefused');
      const refusedStream = await openRelayed(
        sessionFor(person, { oidc_access_token: `idp-${person.id}-refused` })
      );
      const refused = await issuer.requestAt(0);
      expect(refused.headers.authorization).toBe(`Bearer idp-${person.id}-refused`);

      const accepted = await openRelayed(
        sessionFor(person, { oidc_access_token: `idp-${person.id}-accepted` })
      );
      const reopened = await issuer.requestAt(1);
      expect(reopened.headers.authorization).toBe(`Bearer idp-${person.id}-accepted`);

      refusedStream.close();
      accepted.close();
      await reopened.closed;
    });

    it('should open no relay for a local-account session', async () => {
      const person = await createPerson('relaylocal');
      const local = await openRelayed(signFor(person, { provider: 'local' }));
      const relayed = await openRelayed(sessionFor(person));
      const upstream = await issuer.requestAt(0);
      expect(upstream.headers.authorization).toBe(`Bearer idp-${person.id}`);
      expect(issuer.requests).toHaveLength(1);

      local.close();
      relayed.close();
      await upstream.closed;
    });

    it('should refresh a lapsed identity-provider token before the stream opens', async () => {
      const person = await createPerson('relayrefresh');
      const stale = sessionFor(person, {
        oidc_access_token: 'stale-access',
        oidc_refresh_token: `refresh-${person.id}`,
        oidc_expires_at: Date.now() - 1000,
      });

      const first = await openRelayed(stale);
      expect(first.status).toBe(200);
      const refreshed = first.headers.get('x-refreshed-token');
      expect(jwt.decode(refreshed)).toMatchObject({
        id: person.id,
        oidc_access_token: `fresh-refresh-${person.id}`,
        oidc_refresh_token: `next-refresh-${person.id}`,
      });
      expect(issuer.tokenRequests).toHaveLength(1);
      expect(issuer.tokenRequests[0].get('grant_type')).toBe('refresh_token');
      expect(issuer.tokenRequests[0].get('refresh_token')).toBe(`refresh-${person.id}`);

      const upstream = await issuer.requestAt(0);
      expect(upstream.headers.authorization).toBe(`Bearer fresh-refresh-${person.id}`);

      const second = await openRelayed(stale);
      expect(second.headers.get('x-refreshed-token')).toBe(refreshed);
      expect(issuer.tokenRequests).toHaveLength(1);

      first.close();
      second.close();
      await upstream.closed;
    });

    it('should answer 401 when the identity provider refuses the refresh grant', async () => {
      const person = await createPerson('relaydeadgrant');
      const stream = await openRelayed(
        sessionFor(person, {
          oidc_refresh_token: `dead-${person.id}`,
          oidc_expires_at: Date.now() - 1000,
        })
      );
      expect(stream.status).toBe(401);
      expect(stream.body.type).toBe('https://auth.startcloud.com/probs/authentication');
      expect(issuer.tokenRequests).toHaveLength(1);
      expect(issuer.requests).toHaveLength(0);
    });
  });
});
