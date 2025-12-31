const db = require('../app/models');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const { log } = require('../app/utils/Logger');

// Load test configuration
const testConfig = {
  sql: {
    dialect: {
      value: process.env.TEST_DB_DIALECT || 'sqlite',
    },
    storage: {
      value: ':memory:', // Use in-memory SQLite for tests
    },
  },
  boxvault: {
    box_storage_directory: {
      value: path.join(__dirname, '__test_storage__'),
    },
    box_max_file_size: {
      value: 1, // 1GB for tests
    },
    api_listen_port_unencrypted: {
      value: process.env.TEST_PORT || 5001,
    },
  },
};

// Write test config to file
const testConfigPath = path.join(__dirname, '../app/config/test.config.yaml');
fs.writeFileSync(testConfigPath, yaml.dump(testConfig));

// Global setup - runs once before all tests
beforeAll(async () => {
  // Create test storage directory
  const testStorageDir = path.join(__dirname, '__test_storage__');
  if (!fs.existsSync(testStorageDir)) {
    fs.mkdirSync(testStorageDir, { recursive: true });
  }

  // Initialize test database
  try {
    await db.sequelize.sync({ force: true }); // Clear and recreate tables

    // Create test roles
    await db.role.bulkCreate([
      { id: 1, name: 'user' },
      { id: 2, name: 'moderator' },
      { id: 3, name: 'admin' },
    ]);

    // Create test user
    const testUser = await db.user.create({
      username: 'SomeUser',
      email: 'mark.gilbert@prominic.net',
      password: '$2a$08$nQ.fOBddyV/V184UnrIt9.Fj9q8iLEnYjnBB8kxaAbRFq.GQ9iEre', // SoomePass
      verified: true,
      organizationId: 1,
    });

    // Create test organization
    const testOrg = await db.organization.create({
      name: 'STARTcloud',
      email: 'vagrantup-startcloud@prominic.net',
      emailHash: 'd47b0c84e924f69e8601b3772785607615934159defdafca51013afecc2a7f11',
      suspended: false,
    });
    void testOrg;

    // Assign roles to test user
    await testUser.setRoles([2, 3]); // Moderator and Admin roles
  } catch (error) {
    log.error.error('Test database initialization failed:', error);
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
  if (fs.existsSync(testConfigPath)) {
    fs.unlinkSync(testConfigPath);
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
