const fs = require('fs');
const path = require('path');
const { log } = require('../utils/Logger');

exports.uploadSSL = (req, res) => {
  const { targetPath } = req.query;

  if (!targetPath) {
    res.status(400).send({ message: 'Target path is required.' });
    return;
  }

  // Ensure the directory exists
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    } catch (err) {
      log.app.error('Failed to create SSL directory', { error: err.message, dir });
      res.status(500).send({ message: 'Failed to create directory for SSL file.' });
      return;
    }
  }

  const writeStream = fs.createWriteStream(targetPath, {
    flags: 'w',
    mode: 0o600, // Secure permissions for SSL files
  });

  req.pipe(writeStream);

  writeStream.on('finish', () => {
    log.app.info('SSL file uploaded successfully', { path: targetPath });
    res.status(200).send({ message: 'File uploaded successfully.' });
  });

  writeStream.on('error', err => {
    log.app.error('Error writing SSL file', { error: err.message, path: targetPath });
    res.status(500).send({ message: 'Failed to write file.' });
  });

  req.on('error', err => {
    log.app.error('Error reading request stream', { error: err.message });
    writeStream.end();
    res.status(500).send({ message: 'Upload stream error.' });
  });
};
