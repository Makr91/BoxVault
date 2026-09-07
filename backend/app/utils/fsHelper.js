import fs from 'fs';
import { log } from './Logger.js';

const safeUnlink = async filePath => {
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    log.app.warn(`Could not delete the file from disk: ${err.message}`, { path: filePath });
  }
};

const safeRm = async (path, options) => {
  try {
    await fs.promises.rm(path, options);
  } catch (err) {
    log.app.warn(`Could not delete the directory: ${err.message}`, { path });
  }
};

const safeRmdirSync = (path, options) => {
  if (fs.existsSync(path)) {
    fs.rmSync(path, { recursive: true, ...options, force: true });
  }
};

// Idempotent recursive directory creation: succeeds when the directory already
// exists, throws on real failures (permissions, disk) — callers need the
// directory, so genuine errors must propagate.
const ensureDirSync = path => {
  fs.mkdirSync(path, { recursive: true, mode: 0o755 });
};

const safeExistsSync = path => fs.existsSync(path);

export { safeUnlink, safeRm, safeRmdirSync, ensureDirSync, safeExistsSync };

// Atomic file writing lives in atomic-file-writer.js; re-export here so fsHelper.js
// is the single filesystem-helper entry point for callers.
export { atomicWriteFile } from './atomic-file-writer.js';
