const fs = require('fs');

/**
 * Atomically write content to a file using a temporary file approach
 * This prevents race conditions where file watchers might read partially written files
 *
 * @param {string} filePath - The target file path
 * @param {string} content - The content to write
 * @param {string} encoding - File encoding (default: 'utf8')
 * @returns {Promise<void>}
 */
const atomicWriteFile = (filePath, content, encoding = 'utf8') =>
  new Promise((resolve, reject) => {
    // Create temporary file path by appending .tmp to the original path
    const tempPath = `${filePath}.tmp`;

    // Write to temporary file first
    fs.writeFile(tempPath, content, encoding, writeErr => {
      if (writeErr) {
        // Clean up temp file if write failed
        fs.unlink(tempPath, () => undefined); // Ignore cleanup errors
        return reject(writeErr);
      }

      // Atomically rename temp file to final destination
      // This operation is atomic at the filesystem level
      fs.rename(tempPath, filePath, renameErr => {
        if (renameErr) {
          // Clean up temp file if rename failed
          fs.unlink(tempPath, () => undefined); // Ignore cleanup errors
          return reject(renameErr);
        }

        return resolve();
      });
      return undefined;
    });
  });

/**
 * Synchronous version of atomic file write
 *
 * @param {string} filePath - The target file path
 * @param {string} content - The content to write
 * @param {string} encoding - File encoding (default: 'utf8')
 */
const atomicWriteFileSync = (filePath, content, encoding = 'utf8') => {
  const tempPath = `${filePath}.tmp`;

  try {
    // Write to temporary file first
    fs.writeFileSync(tempPath, content, encoding);

    // Atomically rename temp file to final destination
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    // Clean up temp file if operation failed
    try {
      fs.unlinkSync(tempPath);
    } catch (cleanupError) {
      void cleanupError;
      // Ignore cleanup errors
    }
    throw error;
  }
};

module.exports = {
  atomicWriteFile,
  atomicWriteFileSync,
};
