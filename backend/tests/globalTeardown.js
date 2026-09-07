import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default () => {
  console.log('\nRunning Jest Global Teardown...');

  const configDir = path.join(__dirname, '__test_config__');
  const testDbPath = path.join(__dirname, 'test.sqlite');
  const testStoragePath = path.join(__dirname, '__test_storage__');

  if (fs.existsSync(configDir)) {
    fs.rmSync(configDir, { recursive: true, force: true });
  }

  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  if (fs.existsSync(testStoragePath)) {
    fs.rmSync(testStoragePath, { recursive: true, force: true });
  }

  console.log('Test configuration and database files cleaned up.');
};
