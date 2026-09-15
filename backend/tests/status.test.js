import request from 'supertest';
import app from '../server.js';

describe('GET /api/status per Host', () => {
  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
  });

  it('should answer the defaults on the unnamed hostname', async () => {
    const res = await request(app).get('/api/status');
    expect(res.statusCode).toBe(200);
    expect(res.body.collections).toEqual(['boxes', 'isos', 'downloads']);
    expect(res.body.brand).toEqual({
      name: 'BoxVault',
      logoUrl: '/brand/boxvault.svg',
      repo: 'https://github.com/Makr91/BoxVault',
    });
    expect(res.body.links).toEqual({ docs: '/docs', contact: '' });
  });

  it('should answer the sites map entry on a named hostname', async () => {
    const plain = await request(app).get('/api/status');
    const res = await request(app).get('/api/status').set('Host', 'downloads.test');
    expect(res.statusCode).toBe(200);
    expect(res.body.collections).toEqual(['downloads']);
    expect(res.body.brand).toEqual({
      name: 'Test Downloads',
      logoUrl: '/brand/test.svg',
      repo: 'https://github.com/Makr91/BoxVault',
      theme: 'dark',
      pack: { name: 'testpack', css: '/themes/testpack/testpack.css?v=abc' },
    });
    expect(res.body.links).toEqual({ docs: 'https://docs.test', contact: 'help@test' });
    expect(res.body.features).toEqual(plain.body.features);
    expect(res.body.config).toEqual(plain.body.config);
  });
});
