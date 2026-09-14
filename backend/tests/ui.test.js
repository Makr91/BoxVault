import request from 'supertest';
import app from '../server.js';

describe('The served UI build', () => {
  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
  });

  it('should answer /, index.html and the callback entry no-store', async () => {
    const root = await request(app).get('/');
    expect(root.statusCode).toBe(200);
    expect(root.headers['content-type']).toContain('text/html');
    expect(root.headers['cache-control']).toBe('no-store, no-transform');

    const direct = await request(app).get('/index.html');
    expect(direct.statusCode).toBe(200);
    expect(direct.headers['cache-control']).toBe('no-store, no-transform');

    const callback = await request(app).get('/callback/');
    expect(callback.statusCode).toBe(200);
    expect(callback.headers['cache-control']).toBe('no-store, no-transform');
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
    const favicon = await request(app).get('/favicon.ico');
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
