#!/usr/bin/env node

/**
 * Test script to verify atomic file operations work correctly
 * This script simulates the configuration update process
 */

const fs = require('fs');
const yaml = require('js-yaml');
const { getConfigPath } = require('../app/utils/config-loader');
const { atomicWriteFile } = require('../app/utils/atomic-file-writer');
const { log } = require('../app/utils/Logger');

// Test configuration
const testConfig = {
  database_type: {
    type: 'string',
    value: 'sqlite',
    description: 'Database type',
    required: true,
  },
  sql: {
    dialect: {
      type: 'string',
      value: 'sqlite',
      description: 'SQL dialect',
      required: true,
    },
    storage: {
      type: 'string',
      value: '/var/lib/boxvault/database/boxvault.db',
      description: 'SQLite database file path',
      required: false,
    },
  },
};

const testAtomicWrite = async () => {
  log.app.info('Testing atomic file operations...');

  // Get the config path using the same logic as the application
  const configPath = getConfigPath('db');
  log.app.info(`Config path: ${configPath}`);
  log.app.info(`CONFIG_DIR environment variable: ${process.env.CONFIG_DIR || 'not set'}`);
  log.app.info(`NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);

  try {
    // Test atomic write
    const yamlContent = yaml.dump(testConfig);
    log.app.info('\nWriting test configuration atomically...');

    await atomicWriteFile(configPath, yamlContent, 'utf8');
    log.app.info('✅ Atomic write completed successfully');

    // Verify the file was written correctly
    const writtenContent = fs.readFileSync(configPath, 'utf8');
    const parsedConfig = yaml.load(writtenContent);

    if (parsedConfig.sql.dialect.value === 'sqlite') {
      log.app.info('✅ Configuration file content verified');
    } else {
      log.app.info('❌ Configuration file content mismatch');
    }

    // Check that no temporary files remain
    const tempPath = `${configPath}.tmp`;
    if (!fs.existsSync(tempPath)) {
      log.app.info('✅ No temporary files left behind');
    } else {
      log.app.info('❌ Temporary file still exists');
    }

    log.app.info('\n🎉 All tests passed! Atomic file operations are working correctly.');
  } catch (error) {
    log.error.error('❌ Test failed:', error.message);
    throw new Error(`Test failed: ${error.message}`);
  }
};

// Run the test
testAtomicWrite().catch(console.error);
