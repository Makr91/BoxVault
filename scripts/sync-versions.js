#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Synchronize version between root package.json, frontend/package.json, backend/package.json, and config files
 * This ensures frontend, backend, and all configs always have the same version
 */

const rootPackagePath = './package.json';
const frontendPackagePath = './frontend/package.json';
const backendPackagePath = './backend/package.json';
const frontendVersionPath = './frontend/src/version.json';
const appConfigPath = './packaging/config/app.config.yaml';
const authConfigPath = './packaging/config/auth.config.yaml';
const dbConfigPath = './packaging/config/db.config.yaml';
const mailConfigPath = './packaging/config/mail.config.yaml';
const releasePleaseManifestPath = './.release-please-manifest.json';

try {
  // Read root package.json (single source of truth)
  const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, 'utf8'));
  const rootVersion = rootPackage.version;
  
  // 1. Update frontend package.json
  const frontendPackage = JSON.parse(fs.readFileSync(frontendPackagePath, 'utf8'));
  frontendPackage.version = rootVersion;
  fs.writeFileSync(frontendPackagePath, JSON.stringify(frontendPackage, null, 2) + '\n');
  
  // 2. Update backend package.json
  const backendPackage = JSON.parse(fs.readFileSync(backendPackagePath, 'utf8'));
  backendPackage.version = rootVersion;
  fs.writeFileSync(backendPackagePath, JSON.stringify(backendPackage, null, 2) + '\n');
  
  // 3. Update frontend version.json
  const versionJson = { version: rootVersion };
  fs.writeFileSync(frontendVersionPath, JSON.stringify(versionJson, null, 2) + '\n');
  
  // 4. Update config files (if they exist)
  const configFiles = [
    { path: appConfigPath, name: 'App Config' },
    { path: authConfigPath, name: 'Auth Config' },
    { path: dbConfigPath, name: 'DB Config' },
    { path: mailConfigPath, name: 'Mail Config' }
  ];
  
  configFiles.forEach(({ path: configPath, name }) => {
    if (fs.existsSync(configPath)) {
      let configContent = fs.readFileSync(configPath, 'utf8');
      // Update version field in YAML config
      configContent = configContent.replace(/version:\s*[^\n]*/g, `version: ${rootVersion}`);
      fs.writeFileSync(configPath, configContent);
    }
  });
  
  // 5. Update release-please manifest (if exists)
  if (fs.existsSync(releasePleaseManifestPath)) {
    const releasePleaseManifest = JSON.parse(fs.readFileSync(releasePleaseManifestPath, 'utf8'));
    releasePleaseManifest['.'] = rootVersion;
    fs.writeFileSync(releasePleaseManifestPath, JSON.stringify(releasePleaseManifest, null, 2) + '\n');
  }
  
  console.log(`✅ Synchronized versions to ${rootVersion}`);
  console.log(`   - Root: ${rootVersion}`);
  console.log(`   - Frontend: ${rootVersion}`);
  console.log(`   - Backend: ${rootVersion}`);
  console.log(`   - Frontend version.json: ${rootVersion}`);
  console.log(`   - Config files: ${rootVersion}`);
  console.log(`   - Release Please Manifest: ${rootVersion}`);
  console.log(`   - Vite: Using define to inject version at build time`);
  
} catch (error) {
  console.error('❌ Error synchronizing versions:', error.message);
  process.exit(1);
}
