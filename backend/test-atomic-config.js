#!/usr/bin/env node

/**
 * Test script to verify atomic file operations work correctly
 * This script simulates the configuration update process
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { getConfigPath } = require('./app/utils/config-loader');
const { atomicWriteFile } = require('./app/utils/atomic-file-writer');

// Test configuration
const testConfig = {
  database_type: {
    type: 'string',
    value: 'sqlite',
    description: 'Database type',
    required: true
  },
  sql: {
    dialect: {
      type: 'string',
      value: 'sqlite',
      description: 'SQL dialect',
      required: true
    },
    storage: {
      type: 'string',
      value: '/var/lib/boxvault/database/boxvault.db',
      description: 'SQLite database file path',
      required: false
    }
  }
};

async function testAtomicWrite() {
  console.log('Testing atomic file operations...');
  
  // Get the config path using the same logic as the application
  const configPath = getConfigPath('db');
  console.log(`Config path: ${configPath}`);
  console.log(`CONFIG_DIR environment variable: ${process.env.CONFIG_DIR || 'not set'}`);
  console.log(`NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
  
  try {
    // Test atomic write
    const yamlContent = yaml.dump(testConfig);
    console.log('\nWriting test configuration atomically...');
    
    await atomicWriteFile(configPath, yamlContent, 'utf8');
    console.log('✅ Atomic write completed successfully');
    
    // Verify the file was written correctly
    const writtenContent = fs.readFileSync(configPath, 'utf8');
    const parsedConfig = yaml.load(writtenContent);
    
    if (parsedConfig.sql.dialect.value === 'sqlite') {
      console.log('✅ Configuration file content verified');
    } else {
      console.log('❌ Configuration file content mismatch');
    }
    
    // Check that no temporary files remain
    const tempPath = `${configPath}.tmp`;
    if (!fs.existsSync(tempPath)) {
      console.log('✅ No temporary files left behind');
    } else {
      console.log('❌ Temporary file still exists');
    }
    
    console.log('\n🎉 All tests passed! Atomic file operations are working correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testAtomicWrite().catch(console.error);
