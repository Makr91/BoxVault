import { jest } from '@jest/globals';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load test configuration
const dbConfig = {
  sql: {
    dialect: {
      value: process.env.TEST_DB_DIALECT || 'sqlite',
    },
    storage: {
      value: ':memory:', // Use in-memory SQLite for tests
    },
    logging: {
      value: false, // Disable SQL logging during tests
    },
  },
};

const appConfig = {
  boxvault: {
    box_storage_directory: {
      value: path.join(__dirname, '__test_storage__'),
    },
    box_max_file_size: {
      value: 1, // 1GB for tests
    },
    origin: {
      value: 'http://localhost:3000', // Required for CORS in server.js
    },
    api_url: {
      value: 'http://localhost:3000/api',
    },
    api_listen_port_unencrypted: {
      value: process.env.TEST_PORT || 5001,
    },
    api_listen_port_encrypted: {
      value: 5002,
    },
  },
  gravatar: {
    enabled: { value: true },
    default: { value: 'identicon' },
  },
  ticket_system: {
    enabled: { value: true },
    url: { value: 'https://example.com/ticket' },
  },
};

const authConfig = {
  auth: {
    jwt: {
      jwt_secret: {
        value: 'test-secret',
      },
      jwt_expiration: {
        value: '1h',
      },
    },
    oidc: {
      providers: {},
    },
    external: {
      provisioning_fallback_action: { value: 'require_invite' },
    },
  },
};

// Write test configs to separate files
const configDir = path.join(__dirname, '../app/config');
const dbConfigPath = path.join(configDir, 'db.test.config.yaml');
const appConfigPath = path.join(configDir, 'app.test.config.yaml');
const authConfigPath = path.join(configDir, 'auth.test.config.yaml');

fs.writeFileSync(dbConfigPath, yaml.dump(dbConfig));
fs.writeFileSync(appConfigPath, yaml.dump(appConfig));
fs.writeFileSync(authConfigPath, yaml.dump(authConfig));

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
    await db.role.findOrCreate({ where: { id: 2 }, defaults: { name: 'moderator' } });
    await db.role.findOrCreate({ where: { id: 3 }, defaults: { name: 'admin' } });

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
      defaults: { role: 'admin', is_primary: true },
    });

    // Assign global roles to test user
    await testUser.setRoles([1, 2, 3]); // User, Moderator and Admin roles
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
  [dbConfigPath, appConfigPath, authConfigPath].forEach(configPath => {
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
  });

  // Restore console mocks
  if (process.env.SUPPRESS_LOGS === 'true') {
    jest.restoreAllMocks();
  }
});

// Helper functions for tests
global.testHelpers = {
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
