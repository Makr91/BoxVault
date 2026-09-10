import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default () => {
  console.log('\nRunning Jest Global Setup...');

  const configDir = path.join(__dirname, '__test_config__');
  process.env.CONFIG_DIR = configDir;

  const dbConfig = {
    schemaVersion: 2,
    database_type: process.env.TEST_DB_DIALECT || 'sqlite',
    sql: {
      storage: ':memory:',
      logging: false,
    },
  };

  const appConfig = {
    schemaVersion: 1,
    boxvault: {
      box_storage_directory: path.join(__dirname, '__test_storage__'),
      box_max_file_size: 1,
      origin: 'http://localhost:3000',
      api_url: 'http://localhost:3000/api',
      api_listen_port_unencrypted: 5001,
      api_listen_port_encrypted: 5002,
    },
    ticket_system: {
      enabled: true,
      base_url: 'https://example.com/ticket',
    },
    internationalization: {
      default_language: 'en',
    },
    ssl: {
      generate_ssl: false,
    },
    logging: {
      level: 'error',
      console_enabled: true,
      log_directory: path.join(__dirname, '__test_logs__'),
    },
  };

  const authConfig = {
    schemaVersion: 1,
    auth: {
      jwt: {
        jwt_secret: 'test-secret',
        jwt_expiration: '1h',
        jwt_issuer: 'boxvault',
        jwt_audience: 'boxvault-api',
      },
    },
  };

  const mailConfig = {
    schemaVersion: 2,
    smtp_connect: { host: '127.0.0.1', port: 1025 },
    smtp_settings: { from: 'noreply@example.com' },
  };

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(path.join(configDir, 'db.config.yaml'), yaml.dump(dbConfig));
  fs.writeFileSync(path.join(configDir, 'app.config.yaml'), yaml.dump(appConfig));
  fs.writeFileSync(path.join(configDir, 'auth.config.yaml'), yaml.dump(authConfig));
  fs.writeFileSync(path.join(configDir, 'mail.config.yaml'), yaml.dump(mailConfig));

  console.log('Test configuration files created.');
};
