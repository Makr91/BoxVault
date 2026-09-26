import request from 'supertest';
import fs from 'fs';
import yaml from 'js-yaml';
import app from '../server.js';
import { getConfigPath, reloadConfig } from '../app/utils/config-loader.js';

const DEFAULT_FEATURES = [
  'local-accounts',
  'setup',
  'admin',
  'org-console',
  'discover',
  'invitations',
  'uploads',
  'watches',
  'deploy',
  'favorites',
  'notifications',
  'health',
  'footer',
  'sidebar',
  'search',
  'events',
];

const DEFAULT_COMMUNITY = [
  { label: 'Sponsor BoxVault', url: 'https://github.com/sponsors/Makr91' },
  { label: 'Makr91 on GitHub', url: 'https://github.com/Makr91' },
];

const FACE_FEATURES = [
  'admin',
  'discover',
  'uploads',
  'watches',
  'favorites',
  'notifications',
  'health',
  'search',
  'events',
];

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
      logo_url: '/brand/boxvault/mark.svg',
      repo: 'https://github.com/Makr91/BoxVault',
      changelog: 'https://github.com/Makr91/BoxVault/releases',
    });
    expect(res.body.links).toEqual({ docs: '/docs', contact: '', community: DEFAULT_COMMUNITY });
    expect(res.body.features).toEqual(DEFAULT_FEATURES);
  });

  it('should answer the sites map entry on a named hostname', async () => {
    const plain = await request(app).get('/api/status');
    const res = await request(app).get('/api/status').set('Host', 'downloads.test');
    expect(res.statusCode).toBe(200);
    expect(res.body.collections).toEqual(['downloads']);
    expect(res.body.brand).toEqual({
      name: 'Test Downloads',
      logo_url: '/brand/test/mark.svg',
      repo: 'https://github.com/Makr91/BoxVault',
      changelog: 'https://github.com/Makr91/BoxVault/releases',
      theme: 'dark',
      pack: { name: 'testpack', css: '/themes/testpack/testpack.css' },
      packs: [
        { name: 'testpack', css: '/themes/testpack/testpack.css', label: 'testpack' },
        { name: 'otherpack', css: '/themes/otherpack/otherpack.css', label: 'otherpack' },
      ],
    });
    expect(plain.body.brand).not.toHaveProperty('packs');
    const bare = await request(app).get('/api/status').set('Host', 'bare.test');
    expect(bare.body.brand.name).toBe('Bare');
    expect(bare.body.brand).not.toHaveProperty('packs');
    expect(res.body.links).toEqual({
      docs: 'https://docs.test',
      contact: 'help@test',
      community: [{ label: 'Test forum', url: 'https://forum.test' }],
    });
    expect(res.body.features).toEqual(plain.body.features);
    expect(res.body.config).toEqual(plain.body.config);
    expect(res.body.organization).toBe('TestOrg');
    expect(res.body.sorts).toEqual({
      downloads: { providers: [{ column: 'name', direction: 'desc' }] },
    });
    expect(res.body.groups).toEqual({ downloads: { items: 'family' } });
    expect(plain.body).not.toHaveProperty('organization');
    expect(plain.body).not.toHaveProperty('sorts');
    expect(plain.body).not.toHaveProperty('groups');
  });

  it('should answer exactly the listed features on a hostname that declares them', async () => {
    const res = await request(app).get('/api/status').set('Host', 'face.test');
    expect(res.statusCode).toBe(200);
    expect(res.body.collections).toEqual(['downloads']);
    expect(res.body.features).toEqual(FACE_FEATURES);
    expect(res.body.brand.name).toBe('BoxVault');
    expect(res.body.links.community).toEqual(DEFAULT_COMMUNITY);
    expect(res.body).not.toHaveProperty('organization');
    expect(res.body).not.toHaveProperty('sorts');
    expect(res.body).not.toHaveProperty('groups');

    const plain = await request(app).get('/api/status');
    expect(plain.body.features).toEqual(DEFAULT_FEATURES);
  });

  it('should answer local-accounts on a declaring hostname only while listed and local accounts are on', async () => {
    const appConfigPath = getConfigPath('app');
    const authConfigPath = getConfigPath('auth');
    const originalApp = fs.readFileSync(appConfigPath, 'utf8');
    const originalAuth = fs.readFileSync(authConfigPath, 'utf8');
    try {
      const appConfig = yaml.load(originalApp);
      appConfig.sites['face.test'].features = ['local-accounts', 'admin'];
      fs.writeFileSync(appConfigPath, yaml.dump(appConfig));
      await reloadConfig();

      const listed = await request(app).get('/api/status').set('Host', 'face.test');
      expect(listed.body.features).toEqual(['local-accounts', 'admin']);

      const authConfig = yaml.load(originalAuth);
      authConfig.auth.jwt.local_enabled = false;
      fs.writeFileSync(authConfigPath, yaml.dump(authConfig));
      await reloadConfig();

      const off = await request(app).get('/api/status').set('Host', 'face.test');
      expect(off.body.features).toEqual(['admin']);

      const plain = await request(app).get('/api/status');
      expect(plain.body.features).toEqual(DEFAULT_FEATURES.slice(1));
    } finally {
      fs.writeFileSync(appConfigPath, originalApp);
      fs.writeFileSync(authConfigPath, originalAuth);
      await reloadConfig();
    }
  });

  it('should allow the origin of a sites entry cross-origin', async () => {
    const res = await request(app).get('/api/status').set('Origin', 'https://face.test');
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://face.test');

    const stranger = await request(app).get('/api/status').set('Origin', 'https://stranger.test');
    expect(stranger.headers['access-control-allow-origin']).toBeUndefined();
  });
});
