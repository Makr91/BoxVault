import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appConfigPath = path.join(__dirname, '../app/config/app.test.config.yaml');

const axiosGet = jest.fn();
jest.unstable_mockModule('axios', () => ({
  default: { get: axiosGet, post: jest.fn(), delete: jest.fn() },
}));

const request = (await import('supertest')).default;
const app = (await import('../server.js')).default;
const db = (await import('../app/models/index.js')).default;
const jwt = (await import('jsonwebtoken')).default;

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

const updateAppConfig = mutate => {
  const original = fs.readFileSync(appConfigPath, 'utf8');
  const config = yaml.load(original);
  mutate(config);
  fs.writeFileSync(appConfigPath, yaml.dump(config));
  return () => fs.writeFileSync(appConfigPath, original);
};

const HASH = 'a'.repeat(32);

describe('Public configuration endpoints', () => {
  let adminToken;

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    const admin = await db.user.findOne({ where: { username: 'SomeUser' } });
    adminToken = jwt.sign({ id: admin.id }, 'test-secret', { expiresIn: '1h', ...TEST_JWT_CLAIMS });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/gravatar/profile/:emailHash', () => {
    it('should reject a hash that is not hex', async () => {
      const res = await request(app).get('/api/gravatar/profile/not-a-hash');
      expect(res.statusCode).toBe(400);
    });

    it('should answer 404 while no base URL is configured', async () => {
      const res = await request(app).get(`/api/gravatar/profile/${HASH}`);
      expect(res.statusCode).toBe(404);
      expect(axiosGet).not.toHaveBeenCalled();
    });

    describe('with the proxy configured', () => {
      let restore;

      beforeAll(() => {
        restore = updateAppConfig(config => {
          config.gravatar.base_url = { value: 'https://api.gravatar.example/v3/profiles/' };
          config.gravatar.api_key = { value: 'secret-key' };
        });
      });

      afterAll(() => {
        restore();
      });

      it('should relay the profile with the server-side key', async () => {
        axiosGet.mockResolvedValue({ data: { hash: HASH, display_name: 'Someone' } });
        const res = await request(app).get(`/api/gravatar/profile/${HASH.toUpperCase()}`);
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ hash: HASH, display_name: 'Someone' });
        expect(axiosGet).toHaveBeenCalledWith(`https://api.gravatar.example/v3/profiles/${HASH}`, {
          headers: { Authorization: 'Bearer secret-key' },
        });
      });

      it('should answer 404 when Gravatar has no profile', async () => {
        axiosGet.mockRejectedValue({ response: { status: 404 } });
        const res = await request(app).get(`/api/gravatar/profile/${HASH}`);
        expect(res.statusCode).toBe(404);
      });

      it('should answer 500 for any other upstream failure', async () => {
        axiosGet.mockRejectedValue(new Error('timeout'));
        const res = await request(app).get(`/api/gravatar/profile/${HASH}`);
        expect(res.statusCode).toBe(500);
      });
    });

    it('should call Gravatar without a key when none is configured', async () => {
      const restore = updateAppConfig(config => {
        config.gravatar.base_url = { value: 'https://api.gravatar.example/v3/profiles/' };
      });
      try {
        axiosGet.mockResolvedValue({ data: {} });
        const res = await request(app).get(`/api/gravatar/profile/${HASH}`);
        expect(res.statusCode).toBe(200);
        expect(axiosGet).toHaveBeenCalledWith(expect.any(String), { headers: {} });
      } finally {
        restore();
      }
    });
  });

  describe('GET /api/config/hyperweaver', () => {
    it('should answer 404 while not configured', async () => {
      const res = await request(app).get('/api/config/hyperweaver');
      expect(res.statusCode).toBe(404);
    });

    it('should answer the section once configured', async () => {
      const restore = updateAppConfig(config => {
        config.hyperweaver = { enabled: { value: true }, url: { value: 'https://hw.example' } };
      });
      try {
        const res = await request(app).get('/api/config/hyperweaver');
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({
          hyperweaver: { enabled: { value: true }, url: { value: 'https://hw.example' } },
        });
      } finally {
        restore();
      }
    });
  });

  describe('secret knobs on the admin config routes', () => {
    let restore;

    beforeAll(() => {
      restore = updateAppConfig(config => {
        config.probe = {
          secret: { type: 'password', value: 'hidden-value' },
          plain: { type: 'string', value: 'visible' },
        };
      });
    });

    afterAll(() => {
      restore();
    });

    it('should mask password knobs on read', async () => {
      const res = await request(app).get('/api/config/app').set('x-access-token', adminToken);
      expect(res.statusCode).toBe(200);
      expect(res.body.probe.secret.value).toBe('********');
      expect(res.body.probe.plain.value).toBe('visible');
    });

    it('should keep the stored secret when the sentinel comes back and ignore prototype keys', async () => {
      const res = await request(app)
        .put('/api/config/app')
        .set('x-access-token', adminToken)
        .send(
          JSON.parse(
            JSON.stringify({
              probe: { secret: { value: '********' }, plain: { value: 'changed' }, extra: 1 },
              __proto__: { polluted: true },
              constructor: { polluted: true },
            })
          )
        );
      expect(res.statusCode).toBe(200);
      const written = yaml.load(fs.readFileSync(appConfigPath, 'utf8'));
      expect(written.probe.secret.value).toBe('hidden-value');
      expect(written.probe.plain.value).toBe('changed');
      expect(written.probe.extra).toBe(1);
      expect(Object.hasOwn(written, 'polluted')).toBe(false);
    });
  });

  describe('POST /api/client-errors', () => {
    it('should accept an empty report', async () => {
      const res = await request(app).post('/api/client-errors').send({});
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('should accept and bound an oversized batch', async () => {
      const metadataFor = index => {
        if (index === 1) {
          return { blob: 'x'.repeat(20000) };
        }
        return index === 2 ? 'text' : { index };
      };
      const errors = [...Array(250).keys()].map(index => ({
        ts: index % 2 ? '2026-01-01T00:00:00.000Z' : 5,
        level: index % 3 ? 'error' : 7,
        category: index % 5 ? 'app' : null,
        message: index === 0 ? 'm'.repeat(5000) : `message ${index}`,
        metadata: metadataFor(index),
      }));
      errors.unshift(null, 'junk', 42);
      const recent = [...Array(40).keys()].map(index => ({ message: `recent ${index}` }));
      const res = await request(app).post('/api/client-errors').send({ errors, recent });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });
  });
});
