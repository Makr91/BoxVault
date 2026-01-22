import { realpathSync, existsSync, mkdirSync, createWriteStream } from 'fs';
import { resolve as pathResolve, sep, join, dirname } from 'path';
import { log } from '../../utils/Logger.js';

export const uploadSSL = async (req, res) => {
  const { targetPath } = req.query;

  if (!targetPath) {
    res.status(400).send({ message: 'Target path is required.' });
    return;
  }

  // Validate target path to prevent traversal characters
  if (typeof targetPath !== 'string' || targetPath.includes('..') || targetPath.includes('\0')) {
    log.app.warn('Rejected SSL upload due to invalid path characters', { targetPath });
    res.status(400).send({ message: 'Invalid target path.' });
    return;
  }

  // SECURITY: Validate target path to prevent traversal and unauthorized writes
  const configDir = process.env.CONFIG_DIR || '/etc/boxvault';
  let configRoot;
  try {
    // Normalize allowed root and resolve symlinks
    configRoot = realpathSync(pathResolve(configDir));
  } catch (err) {
    log.app.error('Failed to resolve allowed SSL root', { error: err.message });
    res.status(500).send({ message: 'Server configuration error.' });
    return;
  }

  // Ensure we have a consistent trailing separator for prefix checks
  const configRootWithSep = configRoot.endsWith(sep) ? configRoot : configRoot + sep;

  // Resolve the requested path relative to the config root
  const resolvedPath = join(configRoot, targetPath);

  // Allow only paths that are exactly the root or under the root directory

  // Ensure the directory exists
  const dir = dirname(resolvedPath);

  // Re-validate directory path against allowed root before creating it
  const isDirAllowed = dir === configRoot || dir.startsWith(configRootWithSep);

  if (!isDirAllowed) {
    log.app.warn('Blocked SSL directory creation at unauthorized path', { targetPath, dir });
    res.status(403).send({ message: 'Invalid target path.' });
    return;
  }

  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    } catch (err) {
      log.app.error('Failed to create SSL directory', { error: err.message, dir });
      res.status(500).send({ message: 'Failed to create directory for SSL file.' });
      return;
    }
  }

  const writeStream = createWriteStream(resolvedPath, {
    flags: 'w',
    mode: 0o600, // Secure permissions for SSL files
  });

  try {
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', err => reject(new Error(JSON.stringify({ source: 'write', err }))));
      req.on('error', err => {
        writeStream.destroy();
        reject(new Error(JSON.stringify({ source: 'read', err })));
      });
      req.pipe(writeStream);
    });

    log.app.info('SSL file uploaded successfully', { path: resolvedPath });
    res.status(200).send({ message: 'File uploaded successfully.' });
  } catch (error) {
    const errObj = JSON.parse(error.message);

    if (errObj.source === 'write') {
      log.app.error('Error writing SSL file', { error: errObj.err.message, path: resolvedPath });
      res.status(500).send({ message: 'Failed to write file.' });
    } else {
      log.app.error('Error reading request stream', { error: errObj.err.message });
      res.status(500).send({ message: 'Upload stream error.' });
    }
  }
};
