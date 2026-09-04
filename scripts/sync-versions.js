#!/usr/bin/env node

const fs = require('fs');

/**
 * Synchronize version between root package.json, backend/package.json, and config files
 * This ensures the backend and all configs always have the same version
 */

const rootPackagePath = './package.json';
const backendPackagePath = './backend/package.json';
const appConfigPath = './packaging/config/app.config.yaml';
const authConfigPath = './packaging/config/auth.config.yaml';
const dbConfigPath = './packaging/config/db.config.yaml';
const mailConfigPath = './packaging/config/mail.config.yaml';
const releasePleaseManifestPath = './.release-please-manifest.json';

try {
  const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, 'utf8'));
  const rootVersion = rootPackage.version;

  const backendPackage = JSON.parse(fs.readFileSync(backendPackagePath, 'utf8'));
  backendPackage.version = rootVersion;
  fs.writeFileSync(backendPackagePath, JSON.stringify(backendPackage, null, 2) + '\n');

  const configFiles = [
    { path: appConfigPath, name: 'App Config' },
    { path: authConfigPath, name: 'Auth Config' },
    { path: dbConfigPath, name: 'DB Config' },
    { path: mailConfigPath, name: 'Mail Config' },
  ];

  configFiles.forEach(({ path: configPath, name }) => {
    if (fs.existsSync(configPath)) {
      let configContent = fs.readFileSync(configPath, 'utf8');
      configContent = configContent.replace(/version:\s*[^\n]*/g, `version: ${rootVersion}`);
      fs.writeFileSync(configPath, configContent);
    }
  });

  if (fs.existsSync(releasePleaseManifestPath)) {
    const releasePleaseManifest = JSON.parse(fs.readFileSync(releasePleaseManifestPath, 'utf8'));
    releasePleaseManifest['.'] = rootVersion;
    fs.writeFileSync(
      releasePleaseManifestPath,
      JSON.stringify(releasePleaseManifest, null, 2) + '\n'
    );
  }

  console.log(`✅ Synchronized versions to ${rootVersion}`);
  console.log(`   - Root: ${rootVersion}`);
  console.log(`   - Backend: ${rootVersion}`);
  console.log(`   - Config files: ${rootVersion}`);
  console.log(`   - Release Please Manifest: ${rootVersion}`);
} catch (error) {
  console.error('❌ Error synchronizing versions:', error.message);
  process.exit(1);
}
