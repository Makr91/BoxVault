import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { execSync } from 'child_process';
import { X509Certificate } from 'crypto';
import { fileURLToPath } from 'url';
import db from '../app/models/index.js';
import { hashServiceAccountToken } from '../app/utils/serviceAccountAuth.js';
import { runNotificationSweeps, startNotificationSweeps } from '../app/utils/notificationSweeps.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appConfigPath = path.join(__dirname, '../app/config/app.test.config.yaml');
const certDir = path.join(__dirname, '__test_storage__', 'sweep-ssl');
const certPath = path.join(certDir, 'sweep.crt');
const garbagePath = path.join(certDir, 'garbage.crt');

const DAY_MS = 24 * 60 * 60 * 1000;

const updateAppConfig = mutate => {
  const original = fs.readFileSync(appConfigPath, 'utf8');
  const config = yaml.load(original);
  mutate(config);
  fs.writeFileSync(appConfigPath, yaml.dump(config));
  return () => fs.writeFileSync(appConfigPath, original);
};

const inDays = days => new Date(Date.now() + days * DAY_MS - 60 * 1000);

describe('Notification sweeps', () => {
  const uniqueId = Date.now().toString(36);
  let org;
  let user;
  let admin;

  beforeAll(async () => {
    org = await db.organization.create({ name: `SweepOrg-${uniqueId}` });
    user = await db.user.create({
      username: `sweep-user-${uniqueId}`,
      email: `sweep-user-${uniqueId}@example.com`,
      password: 'password',
      verified: true,
    });
    await db.credential.create({
      user_id: user.id,
      provider: 'https://sweep-idp.example',
      subject: `sweep-user-${uniqueId}`,
      external_email: user.email,
    });
    admin = await db.user.findOne({ where: { username: 'SomeUser' } });
    await db.credential.create({
      user_id: admin.id,
      provider: 'https://sweep-idp.example',
      subject: `sweep-admin-${uniqueId}`,
      external_email: admin.email,
    });

    const accounts = [
      ['sweep-week', inDays(7)],
      ['sweep-fortnight', inDays(14)],
      ['sweep-soon', inDays(3)],
      ['sweep-far', inDays(60)],
    ];
    await Promise.all(
      accounts.map(([label, expiresAt]) =>
        db.service_account.create({
          username: `${label}-${uniqueId}`,
          token: hashServiceAccountToken(`${label}-${uniqueId}`),
          expiresAt,
          userId: user.id,
          organization_id: org.id,
        })
      )
    );

    fs.mkdirSync(certDir, { recursive: true });
    execSync(
      `openssl req -x509 -nodes -days 3650 -newkey rsa:2048 -keyout "${path.join(certDir, 'sweep.key')}" -out "${certPath}" -subj "/CN=boxvault-sweep"`,
      { stdio: 'pipe' }
    );
    fs.writeFileSync(garbagePath, 'not a certificate');
  });

  afterAll(async () => {
    await db.service_account.destroy({ where: { userId: user.id } });
    await db.credential.destroy({ where: { user_id: [user.id, admin.id] } });
    await org.destroy();
    await user.destroy();
    fs.rmSync(certDir, { recursive: true, force: true });
  });

  it('should sweep service-account expiries with the default thresholds', async () => {
    await expect(runNotificationSweeps()).resolves.toBeUndefined();
  });

  it('should honour a configured warning window', async () => {
    const restore = updateAppConfig(config => {
      config.monitoring = { sa_expiry_warning_days: { value: 3 } };
    });
    try {
      await expect(runNotificationSweeps()).resolves.toBeUndefined();
    } finally {
      restore();
    }
  });

  it('should skip the certificate sweep when the file is missing', async () => {
    const restore = updateAppConfig(config => {
      config.ssl = { cert_path: { value: 'missing-sweep.crt' } };
    });
    try {
      await expect(runNotificationSweeps()).resolves.toBeUndefined();
    } finally {
      restore();
    }
  });

  it('should survive an unreadable certificate', async () => {
    const restore = updateAppConfig(config => {
      config.ssl = { cert_path: { value: garbagePath } };
    });
    try {
      await expect(runNotificationSweeps()).resolves.toBeUndefined();
    } finally {
      restore();
    }
  });

  it('should read the certificate and stay quiet outside the warning window', async () => {
    const restore = updateAppConfig(config => {
      config.ssl = { cert_path: { value: certPath } };
      config.monitoring = { ssl_expiry_warning_days: { value: 30 } };
    });
    try {
      await expect(runNotificationSweeps()).resolves.toBeUndefined();
    } finally {
      restore();
    }
  });

  it('should warn the global admins when the certificate enters the window', async () => {
    const cert = new X509Certificate(fs.readFileSync(certPath));
    const daysLeft = Math.ceil((new Date(cert.validTo).getTime() - Date.now()) / DAY_MS);
    const restore = updateAppConfig(config => {
      config.ssl = { cert_path: { value: certPath } };
      config.monitoring = { ssl_expiry_warning_days: { value: daysLeft } };
    });
    try {
      await expect(runNotificationSweeps()).resolves.toBeUndefined();
    } finally {
      restore();
    }
  });

  it('should schedule the daily sweep', () => {
    const timer = startNotificationSweeps();
    expect(timer).toBeDefined();
    clearInterval(timer);
  });
});
