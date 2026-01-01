const fs = require('fs');
const { log } = require('./Logger');

const safeUnlink = filePath => {
  try {
    fs.unlink(filePath, err => {
      if (err) {
        log.app.info(`Could not delete the file from disk: ${err}`);
      }
    });
  } catch (err) {
    log.app.error(`Error in safeUnlink: ${err.message}`);
  }
};

const safeRm = (path, options) => {
  try {
    fs.rm(path, options, err => {
      if (err) {
        log.app.info(`Could not delete the directory: ${err}`);
      }
    });
  } catch (err) {
    log.app.error(`Error in safeRm: ${err.message}`);
  }
};

const safeRmdirSync = (path, options) => {
  if (fs.existsSync(path)) {
    fs.rmdirSync(path, options);
  }
};

const safeMkdirSync = (path, options) => {
  fs.mkdirSync(path, options);
};

const safeRenameSync = (oldPath, newPath) => {
  fs.renameSync(oldPath, newPath);
};

const safeExistsSync = path => fs.existsSync(path);

module.exports = {
  safeUnlink,
  safeRm,
  safeRmdirSync,
  safeMkdirSync,
  safeRenameSync,
  safeExistsSync,
};
