import request from 'supertest';
import { createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import app from '../server.js';
import db from '../app/models/index.js';

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

const collect = (response, callback) => {
  const chunks = [];
  response.on('data', chunk => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
};

describe('The served UI build', () => {
  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
  });

  it('should answer / stamped no-store, refuse a direct index.html and serve the callback entry', async () => {
    const root = await request(app).get('/');
    expect(root.statusCode).toBe(200);
    expect(root.headers['content-type']).toContain('text/html');
    expect(root.headers['cache-control']).toBe('no-store, no-transform');
    expect(root.text).toContain('<html data-brand-theme="light"');
    expect(root.text).not.toContain('data-brand=');

    const direct = await request(app).get('/index.html');
    expect(direct.statusCode).toBe(404);

    const callbackDirect = await request(app).get('/callback/index.html');
    expect(callbackDirect.statusCode).toBe(404);

    const callback = await request(app).get('/callback/');
    expect(callback.statusCode).toBe(200);
    expect(callback.headers['cache-control']).toBe('no-store, no-transform');
  });

  it('should stamp the theme, the brand and the pack link of a named hostname', async () => {
    const res = await request(app).get('/').set('Host', 'downloads.test');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('<html data-brand-theme="dark" data-brand="testpack"');
    expect(res.text).toContain(
      '<link rel="stylesheet" href="/themes/testpack/testpack.css"></head>'
    );
  });

  it('should point the icon links of a named hostname into its brand folder', async () => {
    const res = await request(app).get('/').set('Host', 'downloads.test');
    expect(res.text).toContain('href="/brand/test/favicon.ico" sizes="32x32"');
    expect(res.text).toContain('href="/brand/test/mark.svg" type="image/svg+xml"');
    expect(res.text).toContain('rel="apple-touch-icon" href="/brand/test/mark-192.png"');
    expect(res.text).not.toContain('/brand/startcloud/');

    const plain = await request(app).get('/');
    expect(plain.text).toContain('href="/brand/startcloud/favicon.ico" sizes="32x32"');
  });

  it('should answer the manifest per hostname and the built file on the unnamed one', async () => {
    const named = await request(app).get('/manifest.json').set('Host', 'downloads.test');
    expect(named.statusCode).toBe(200);
    expect(named.headers['content-type']).toContain('application/manifest+json');
    expect(named.headers['cache-control']).toBe('no-cache');
    expect(named.body.name).toBe('Test Downloads');
    expect(named.body.short_name).toBe('Test Downloads');
    expect(named.body.icons.map(icon => icon.src)).toEqual([
      '/brand/test/mark.svg',
      '/brand/test/mark-192.png',
      '/brand/test/mark-512.png',
    ]);

    const plain = await request(app).get('/manifest.json');
    expect(plain.statusCode).toBe(200);
    expect(plain.headers['cache-control']).toBe('no-cache');
    expect(plain.body.name).toBe('STARTcloud');
    expect(plain.body.icons[0].src).toBe('/brand/startcloud/mark.svg');

    const face = await request(app).get('/manifest.json').set('Host', 'face.test');
    expect(face.statusCode).toBe(200);
    expect(face.body.name).toBe('STARTcloud');
  });

  it('should serve an asset no-cache with an ETag and answer 304 to If-None-Match', async () => {
    const first = await request(app).get('/assets/main.js');
    expect(first.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe('no-cache');
    expect(first.headers.etag).toBeDefined();

    const again = await request(app)
      .get('/assets/main.js')
      .set('If-None-Match', first.headers.etag);
    expect(again.statusCode).toBe(304);
  });

  it('should serve the favicon and the push worker no-cache', async () => {
    const favicon = await request(app).get('/brand/startcloud/favicon.ico');
    expect(favicon.statusCode).toBe(200);
    expect(favicon.headers['content-type']).toBe('image/x-icon');
    expect(favicon.headers['cache-control']).toBe('no-cache');

    const worker = await request(app).get('/notification-sw.js');
    expect(worker.statusCode).toBe(200);
    expect(worker.headers['cache-control']).toBe('no-cache');
    expect(worker.headers['service-worker-allowed']).toBe('/push/');
  });

  it('should answer a browser deep link with index.html no-store', async () => {
    const res = await request(app).get('/some-org/some-box');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['cache-control']).toBe('no-store, no-transform');
  });
});

describe('The downloads address', () => {
  let org;
  let owner;
  let token;
  const uniqueId = Date.now();
  const orgName = `DownloadsUiOrg_${uniqueId}`;
  const product = 'prod';
  const fileName = 'prod-1.0.0.tar';
  const fileContent = Buffer.from(`downloads-ui-file-${uniqueId}`);
  const apiBase = `/api/organization/${orgName}/download`;
  const pageBase = `/${orgName}/downloads/${product}`;

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);

    org = await db.organization.create({ name: orgName, access_mode: 'private' });
    owner = await db.user.create({
      username: `DownloadsUiOwner_${uniqueId}`,
      email: `downloadsuiowner_${uniqueId}@example.com`,
      password: 'password',
      verified: true,
    });
    const userRole = await db.role.findOne({ where: { name: 'user' } });
    await owner.setRoles([userRole]);
    await db.UserOrg.create({ user_id: owner.id, organization_id: org.id, role: 'owner' });
    token = jwt.sign({ id: owner.id }, 'test-secret', { expiresIn: '1h', ...TEST_JWT_CLAIMS });

    await request(app)
      .post(apiBase)
      .set('x-access-token', token)
      .send({
        name: product,
        family: 'Family',
        vendor: 'Vendor',
        is_public: true,
        published: true,
      })
      .expect(201);
    await request(app)
      .post(`${apiBase}/${product}/release`)
      .set('x-access-token', token)
      .send({ version_number: '1.0.0', is_public: true, published: true })
      .expect(201);
    await request(app)
      .post(`${apiBase}/${product}/release/1.0.0/patch`)
      .set('x-access-token', token)
      .send({ name: 'release', kind: 'release', is_public: true, published: true })
      .expect(201);
    await request(app)
      .post(`${apiBase}/${product}/release/1.0.0/patch/release/file`)
      .set('x-access-token', token)
      .send({
        key: 'linux-x64',
        file_name: fileName,
        kind: 'installer',
        platform: 'linux',
        architecture: 'x64',
        language: 'en',
        is_public: true,
        published: true,
      })
      .expect(201);
    await request(app)
      .post(`${apiBase}/${product}/release/1.0.0/patch/release/file/linux-x64/upload`)
      .set('x-access-token', token)
      .set('x-file-name', fileName)
      .set('x-checksum', createHash('sha256').update(fileContent).digest('hex'))
      .set('x-checksum-type', 'SHA256')
      .set('Content-Type', 'application/octet-stream')
      .send(fileContent)
      .expect(200);
  });

  afterAll(async () => {
    await request(app).delete(apiBase).set('x-access-token', token);
    await org.destroy();
    await owner.destroy();
  });

  it('should answer JSON at a product address to a program', async () => {
    const res = await request(app).get(pageBase).set('Accept', 'application/json');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body.name).toBe(product);
  });

  it('should answer the bytes at a file address by key and by file name', async () => {
    const byKey = await request(app)
      .get(`${pageBase}/1.0.0/release/linux-x64`)
      .set('Accept', '*/*')
      .buffer(true)
      .parse(collect);
    expect(byKey.statusCode).toBe(200);
    expect(byKey.headers['content-disposition']).toContain(fileName);
    expect(Buffer.compare(byKey.body, fileContent)).toBe(0);

    const byName = await request(app)
      .get(`${pageBase}/1.0.0/release/${fileName}`)
      .set('Accept', '*/*')
      .buffer(true)
      .parse(collect);
    expect(byName.statusCode).toBe(200);
    expect(Buffer.compare(byName.body, fileContent)).toBe(0);
  });

  it('should answer the page to a browser', async () => {
    const res = await request(app).get(pageBase).set('Accept', 'text/html');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['cache-control']).toBe('no-store, no-transform');
  });

  it('should drop the downloads segment on a hostname whose first collection is downloads', async () => {
    const face = await request(app)
      .get(`/${orgName}/${product}`)
      .set('Host', 'downloads.test')
      .set('Accept', 'application/json');
    expect(face.statusCode).toBe(200);
    expect(face.body.name).toBe(product);

    const plain = await request(app)
      .get(`/${orgName}/${product}`)
      .set('Accept', 'application/json');
    expect(plain.statusCode).toBe(200);
    expect(plain.headers['content-type']).toContain('text/html');
  });
});
