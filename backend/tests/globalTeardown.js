import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default () => {
  console.log('\nRunning Jest Global Teardown...');

  const configDir = path.join(__dirname, '../app/config');
  const testDbPath = path.join(__dirname, 'test.sqlite');
  const testStoragePath = path.join(__dirname, '__test_storage__');

  const filesToDelete = [
    path.join(configDir, 'db.test.config.yaml'),
    path.join(configDir, 'app.test.config.yaml'),
    path.join(configDir, 'auth.test.config.yaml'),
    path.join(configDir, 'mail.test.config.yaml'),
    testDbPath,
  ];

  for (const file of filesToDelete) {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }

  if (fs.existsSync(testStoragePath)) {
    fs.rmSync(testStoragePath, { recursive: true, force: true });
  }

  console.log('Test configuration and database files cleaned up.');
};
