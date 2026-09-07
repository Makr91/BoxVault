import fs from 'fs';
import yaml from 'js-yaml';
import { clearConfigCache, getConfigPath } from '../app/utils/config-loader.js';
import { ensureVapidKeys, getVapidPublicKey } from '../app/utils/webPush.js';

const appConfigPath = getConfigPath('app');

describe('VAPID key provisioning', () => {
  let original;

  beforeAll(() => {
    original = fs.readFileSync(appConfigPath, 'utf8');
  });

  afterAll(() => {
    fs.writeFileSync(appConfigPath, original);
    clearConfigCache();
  });

  it('should generate and persist a keypair when the section is absent', async () => {
    expect(getVapidPublicKey()).toBeNull();
    await expect(ensureVapidKeys()).resolves.toBe(true);

    const written = yaml.load(fs.readFileSync(appConfigPath, 'utf8'));
    const section = written.notifications;
    expect(section.vapid_public_key).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    expect(section.vapid_private_key).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(getVapidPublicKey()).toBe(section.vapid_public_key);
  });

  it('should keep an existing keypair', async () => {
    const before = yaml.load(fs.readFileSync(appConfigPath, 'utf8')).notifications;
    await expect(ensureVapidKeys()).resolves.toBe(false);
    const after = yaml.load(fs.readFileSync(appConfigPath, 'utf8')).notifications;
    expect(after.vapid_public_key).toBe(before.vapid_public_key);
  });

  it('should keep the knobs of a partial section while generating', async () => {
    const config = yaml.load(fs.readFileSync(appConfigPath, 'utf8'));
    config.notifications = { enabled: false };
    fs.writeFileSync(appConfigPath, yaml.dump(config));
    clearConfigCache();

    await expect(ensureVapidKeys()).resolves.toBe(true);
    const written = yaml.load(fs.readFileSync(appConfigPath, 'utf8')).notifications;
    expect(written.enabled).toBe(false);
    expect(written.vapid_public_key).not.toBe('');
    expect(getVapidPublicKey()).toBeNull();
  });
});
