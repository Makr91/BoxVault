const fs = require('fs');
const path = require('path');
const { log } = require('../utils/Logger');

exports.uploadSSL = (req, res) => {
  const { targetPath } = req.query;

  if (!targetPath) {
    res.status(400).send({ message: 'Target path is required.' });
    return;
  }

  // SECURITY: Validate target path to prevent traversal and unauthorized writes
  const configDir = process.env.CONFIG_DIR || '/etc/boxvault';
  let configRoot;
  try {
    // Normalize allowed root and resolve symlinks
    configRoot = fs.realpathSync(path.resolve(configDir));
  } catch (err) {
    log.app.error('Failed to resolve allowed SSL root', { error: err.message });
    res.status(500).send({ message: 'Server configuration error.' });
    return;
  }

  // Ensure we have a consistent trailing separator for prefix checks
  const configRootWithSep = configRoot.endsWith(path.sep) ? configRoot : configRoot + path.sep;

  // Resolve the requested path relative to the config root
  const candidatePath = path.resolve(configRoot, targetPath);
  let resolvedPath;
  try {
    resolvedPath = fs.realpathSync(candidatePath);
  } catch (err) {
    log.app.warn('Rejected SSL upload due to invalid path', { targetPath, error: err.message });
    res.status(400).send({ message: 'Invalid target path.' });
    return;
  }

  // Allow only paths that are exactly the root or under the root directory
  const isAllowed = resolvedPath === configRoot || resolvedPath.startsWith(configRootWithSep);

  if (!isAllowed) {
    log.app.warn('Blocked SSL upload to unauthorized path', { targetPath, resolvedPath });
    res.status(403).send({ message: 'Invalid target path.' });
    return;
  }

  // Ensure the directory exists
  const dir = path.dirname(resolvedPath);

  // Re-validate directory path against allowed root before creating it
  const isDirAllowed = dir === configRoot || dir.startsWith(configRootWithSep);

  if (!isDirAllowed) {
    log.app.warn('Blocked SSL directory creation at unauthorized path', { targetPath, dir });
    res.status(403).send({ message: 'Invalid target path.' });
    return;
  }

  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    } catch (err) {
      log.app.error('Failed to create SSL directory', { error: err.message, dir });
      res.status(500).send({ message: 'Failed to create directory for SSL file.' });
      return;
    }
  }

  const writeStream = fs.createWriteStream(resolvedPath, {
    flags: 'w',
    mode: 0o600, // Secure permissions for SSL files
  });

  req.pipe(writeStream);

  writeStream.on('finish', () => {
    log.app.info('SSL file uploaded successfully', { path: resolvedPath });
    res.status(200).send({ message: 'File uploaded successfully.' });
  });

  writeStream.on('error', err => {
    log.app.error('Error writing SSL file', { error: err.message, path: resolvedPath });
    res.status(500).send({ message: 'Failed to write file.' });
  });

  req.on('error', err => {
    log.app.error('Error reading request stream', { error: err.message });
    writeStream.end();
    res.status(500).send({ message: 'Upload stream error.' });
  });
};
