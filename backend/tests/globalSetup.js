import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default () => {
  console.log('\nRunning Jest Global Setup...');

  const isSilent = process.env.SUPPRESS_LOGS === 'true';

  const dbConfig = {
    sql: {
      dialect: { value: process.env.TEST_DB_DIALECT || 'sqlite' },
      storage: { value: ':memory:' },
      logging: { value: false },
    },
  };

  const appConfig = {
    boxvault: {
      box_storage_directory: { value: path.join(__dirname, '__test_storage__') },
      box_max_file_size: { value: 1 },
      origin: { value: 'http://localhost:3000' },
      api_url: { value: 'http://localhost:3000/api' },
      api_listen_port_unencrypted: { value: 5001 },
      api_listen_port_encrypted: { value: 5002 },
    },
    gravatar: {
      enabled: { value: true },
      default: { value: 'identicon' },
    },
    ticket_system: {
      enabled: { value: true },
      url: { value: 'https://example.com/ticket' },
    },
    internationalization: {
      default_language: { value: 'en' },
    },
    logging: {
      level: { value: isSilent ? 'silent' : 'error' },
      console_enabled: { value: !isSilent },
    },
  };

  const authConfig = {
    auth: {
      jwt: {
        jwt_secret: { value: 'test-secret' },
        jwt_expiration: { value: '1h' },
      },
      enabled_strategies: { value: ['local'] },
    },
  };

  const mailConfig = {
    smtp_connect: { host: { value: 'localhost' }, port: { value: 1025 } },
  };

  const configDir = path.join(__dirname, '../app/config');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(path.join(configDir, 'db.test.config.yaml'), yaml.dump(dbConfig));
  fs.writeFileSync(path.join(configDir, 'app.test.config.yaml'), yaml.dump(appConfig));
  fs.writeFileSync(path.join(configDir, 'auth.test.config.yaml'), yaml.dump(authConfig));
  fs.writeFileSync(path.join(configDir, 'mail.test.config.yaml'), yaml.dump(mailConfig));

  console.log('Test configuration files created.');
};
