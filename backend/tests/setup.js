// TESTING RULE FOR THIS REPO — tests exercise the real code against real
// resources. Anything reachable live is used live: the dev auth server with
// its OIDC, SCIM push and S2S invite API, the real database, real SMTP, the
// real filesystem. Nothing BoxVault consumes is re-implemented or stubbed
// inside the tests, and the target amount of simulation is zero: an error
// path is exercised by causing the real condition (revoke the token, remove
// the permission, corrupt the checksum), never by stubbing the layer that
// fails. The mocks still present are legacy from before this rule; builds do
// not gate on tests, so they are replaced as the affected areas are touched.
import { jest } from '@jest/globals';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load test configuration
const dbConfig = {
  schemaVersion: 1,
  sql: {
    dialect: process.env.TEST_DB_DIALECT || 'sqlite',
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
    api_listen_port_unencrypted: Number(process.env.TEST_PORT) || 5001,
    api_listen_port_encrypted: 5002,
  },
  gravatar: {
    base_url: '',
  },
  ticket_system: {
    enabled: true,
    base_url: 'https://example.com/ticket',
  },
  rate_limiting: {
    window_minutes: 15,
    max_requests: 1000000,
    file_operations_max_requests: 1000000,
    download_max_requests: 1000000,
    download_link_max_requests: 1000000,
    architecture_operations_max_requests: 1000000,
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
      local_enabled: true,
    },
    local: {
      local_require_email_verification: false,
      local_password_min_length: 6,
      local_password_require_uppercase: false,
      local_password_require_lowercase: false,
      local_password_require_numbers: false,
      local_password_require_symbols: false,
      local_bcrypt_rounds: 8,
      local_session_timeout: 24,
      local_allow_new_organizations: true,
    },
    oidc: {
      providers: {},
    },
    external: {
      provisioning_fallback_action: 'require_invite',
    },
  },
};

const mailConfig = {
  schemaVersion: 1,
  smtp_connect: { host: 'localhost', port: 1025 },
  smtp_settings: { from: 'noreply@example.com' },
};

// Write test configs to separate files
const configDir = path.join(__dirname, '../app/config');
const dbConfigPath = path.join(configDir, 'db.test.config.yaml');
const appConfigPath = path.join(configDir, 'app.test.config.yaml');
const authConfigPath = path.join(configDir, 'auth.test.config.yaml');
const mailConfigPath = path.join(configDir, 'mail.test.config.yaml');

fs.writeFileSync(dbConfigPath, yaml.dump(dbConfig));
fs.writeFileSync(appConfigPath, yaml.dump(appConfig));
fs.writeFileSync(authConfigPath, yaml.dump(authConfig));
fs.writeFileSync(mailConfigPath, yaml.dump(mailConfig));

// Require models AFTER configs are written to avoid "undefined" errors
const { default: db } = await import('../app/models/index.js');

// Global setup - runs once before all tests
beforeAll(async () => {
  // Suppress console logs if configured
  if (process.env.SUPPRESS_LOGS === 'true') {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // Dynamically import logger to avoid early initialization logging
    const { log } = await import('../app/utils/Logger.js');

    // Save original log methods to global for restoration in logger tests
    global.originalLogMethods = {};

    // Silence Winston Logger wrappers
    Object.keys(log).forEach(category => {
      if (log[category] && typeof log[category] === 'object') {
        Object.keys(log[category]).forEach(level => {
          if (
            typeof log[category][level] === 'function' &&
            !jest.isMockFunction(log[category][level])
          ) {
            // Save original before replacing
            if (!global.originalLogMethods[category]) {
              global.originalLogMethods[category] = {};
            }
            global.originalLogMethods[category][level] = log[category][level];

            log[category][level] = () => {};
          }
        });
      }
    });
  }

  // Create test storage directory
  const testStorageDir = path.join(__dirname, '__test_storage__');
  if (!fs.existsSync(testStorageDir)) {
    fs.mkdirSync(testStorageDir, { recursive: true });
  }

  // Initialize test database
  try {
    await db.sequelize.sync({ force: true }); // Clear and recreate tables

    // Create Sessions table for connect-session-sequelize
    // This table is required for session persistence but isn't a defined model
    await db.sequelize.query(`
      CREATE TABLE IF NOT EXISTS Sessions (
        sid VARCHAR(255) PRIMARY KEY,
        expires DATETIME,
        data TEXT,
        createdAt DATETIME,
        updatedAt DATETIME
      )
    `);

    // Create test roles idempotently to prevent unique constraint errors
    await db.role.findOrCreate({ where: { id: 1 }, defaults: { name: 'user' } });
    await db.role.findOrCreate({ where: { id: 2 }, defaults: { name: 'admin' } });

    // Create test organization idempotently
    const [testOrg] = await db.organization.findOrCreate({
      where: { name: 'STARTcloud' },
      defaults: {
        id: 1,
        name: 'STARTcloud',
        email: 'vagrantup-startcloud@prominic.net',
        emailHash: 'd47b0c84e924f69e8601b3772785607615934159defdafca51013afecc2a7f11',
        suspended: false,
      },
    });

    // Create test user
    const [testUser] = await db.user.findOrCreate({
      where: { username: 'SomeUser' },
      defaults: {
        email: 'mark.gilbert@prominic.net',
        password: '$2a$08$nQ.fOBddyV/V184UnrIt9.Fj9q8iLEnYjnBB8kxaAbRFq.GQ9iEre', // SoomePass
        verified: true,
        primary_organization_id: testOrg.id,
      },
    });

    // Assign user to organization with a role
    await db.UserOrg.findOrCreate({
      where: { user_id: testUser.id, organization_id: testOrg.id },
      defaults: { role: 'owner', is_primary: true },
    });

    // Assign global roles to test user
    await testUser.setRoles([1, 2]); // User and Admin roles
  } catch (error) {
    console.error('Test database initialization failed:', error);
    throw error;
  }
});

// Global teardown - runs once after all tests
afterAll(async () => {
  // Close database connection
  await db.sequelize.close();

  // Clean up test storage
  const testStorageDir = path.join(__dirname, '__test_storage__');
  if (fs.existsSync(testStorageDir)) {
    fs.rmSync(testStorageDir, { recursive: true, force: true });
  }

  // Clean up test config
  [dbConfigPath, appConfigPath, authConfigPath, mailConfigPath].forEach(configPath => {
    [configPath, `${configPath}.bak`].forEach(file => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    });
  });

  // Restore console mocks
  if (process.env.SUPPRESS_LOGS === 'true') {
    jest.restoreAllMocks();
  }
});

// Helper functions for tests
global.testHelpers = {
  async waitForAppReady(app) {
    const { default: request } = await import('supertest');
    const probe = async attempt => {
      if (attempt >= 250) {
        throw new Error('Application routes never mounted');
      }
      const res = await request(app).get('/api/health');
      if (res.statusCode !== 404) {
        return undefined;
      }
      await new Promise(resolve => {
        setTimeout(resolve, 100);
      });
      return probe(attempt + 1);
    };
    return probe(0);
  },

  // Create a test box with version, provider, and architecture
  async createTestBox(boxData, versionData, providerData, architectureData) {
    const box = await db.box.create(boxData);
    if (versionData) {
      const version = await db.version.create({ ...versionData, boxId: box.id });
      if (providerData) {
        const provider = await db.provider.create({ ...providerData, versionId: version.id });
        if (architectureData) {
          const architecture = await db.architecture.create({
            ...architectureData,
            providerId: provider.id,
          });
          return { box, version, provider, architecture };
        }
        return { box, version, provider };
      }
      return { box, version };
    }
    return { box };
  },

  // Clean up test data
  async cleanupTestData(box) {
    if (box) {
      await db.box.destroy({ where: { id: box.id }, cascade: true });
    }
  },
};
