const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const db = require("../models");

// Load app config for max file size
const appConfigPath = path.join(__dirname, '../config/app.config.yaml');
let maxFileSize;
let appConfig;

try {
  const fileContents = fs.readFileSync(appConfigPath, 'utf8');
  appConfig = yaml.load(fileContents);
  maxFileSize = appConfig.boxvault.box_max_file_size.value * 1024 * 1024 * 1024; // Convert GB to bytes
} catch (e) {
  console.error(`Failed to load app configuration: ${e.message}`);
  maxFileSize = 10 * 1024 * 1024 * 1024; // Default to 10GB
}

// Main upload middleware that streams directly to disk
const uploadMiddleware = async (req, res) => {
  // Disable request timeouts
  req.setTimeout(0);
  res.setTimeout(0);

  // Prevent request from being parsed by body-parser
  req._body = true;

  const startTime = Date.now();
  let uploadedBytes = 0;
  let writeStream;

  try {
    const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
    const contentLength = parseInt(req.headers['content-length']);

    // Validate content length
    if (isNaN(contentLength)) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Content-Length header required'
      });
    }

    if (contentLength > maxFileSize) {
      return res.status(413).json({
        error: 'FILE_TOO_LARGE',
        message: `File size cannot exceed ${maxFileSize / (1024 * 1024 * 1024)}GB`
      });
    }

    // Load config and prepare upload directory
    const configContents = fs.readFileSync(appConfigPath, 'utf8');
    const config = yaml.load(configContents);
    const uploadDir = path.join(config.boxvault.box_storage_directory.value, organization, boxId, versionNumber, providerName, architectureName);
    fs.mkdirSync(uploadDir, { recursive: true, mode: 0o755 });
    const finalPath = path.join(uploadDir, 'vagrant.box');

    // Create write stream with high watermark to prevent backpressure
    writeStream = fs.createWriteStream(finalPath, {
      highWaterMark: 1024 * 1024 * 16 // 16MB buffer
    });

    // Log upload start
    console.log('Starting file upload:', {
      fileName: req.headers['x-file-name'] || 'vagrant.box',
      fileSize: contentLength,
      checksum: req.headers['x-checksum'] || 'none',
      checksumType: req.headers['x-checksum-type'] || 'NULL',
      path: finalPath
    });

    // Handle stream events
    req.on('data', chunk => {
      uploadedBytes += chunk.length;
      
      // Write chunk to file
      if (!writeStream.write(chunk)) {
        // Handle backpressure - pause reading until drain
        req.pause();
        writeStream.once('drain', () => req.resume());
      }

      // Log progress every 1GB
      if (uploadedBytes % (1024 * 1024 * 1024) === 0) {
        console.log('Upload progress:', {
          uploadedBytes,
          progress: Math.round((uploadedBytes / contentLength) * 100) + '%'
        });
      }
    });

    // Wait for upload to complete
    await new Promise((resolve, reject) => {
      req.on('end', resolve);
      req.on('error', reject);
      writeStream.on('error', err => {
        console.error('Write stream error:', err);
        reject(err);
      });
    });

    // Close write stream
    await new Promise((resolve, reject) => {
      writeStream.end(err => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Verify file size
    const finalSize = fs.statSync(finalPath).size;
    if (Math.abs(finalSize - contentLength) > 1024) { // Allow 1KB difference
      throw new Error('File size mismatch');
    }

    // Find or create database records
    const version = await db.versions.findOne({
      where: { versionNumber },
      include: [{
        model: db.box,
        as: 'box',
        where: { name: boxId }
      }]
    });

    if (!version) {
      throw new Error(`Version ${versionNumber} not found for box ${boxId}`);
    }

    const provider = await db.providers.findOne({
      where: { 
        name: providerName,
        versionId: version.id
      }
    });

    if (!provider) {
      throw new Error(`Provider ${providerName} not found`);
    }

    const architecture = await db.architectures.findOne({
      where: { 
        name: architectureName,
        providerId: provider.id
      }
    });

    if (!architecture) {
      throw new Error(`Architecture not found for provider ${providerName}`);
    }

    // Update database
    const fileData = {
      fileName: 'vagrant.box',
      checksum: req.headers['x-checksum'] || null,
      checksumType: (req.headers['x-checksum-type'] || 'NULL').toUpperCase(),
      architectureId: architecture.id,
      fileSize: finalSize
    };

    const fileRecord = await db.files.findOne({
      where: {
        fileName: 'vagrant.box',
        architectureId: architecture.id
      }
    });

    if (fileRecord) {
      await fileRecord.update(fileData);
    } else {
      await db.files.create(fileData);
    }

    // Calculate stats
    const duration = Date.now() - startTime;
    const speed = Math.round(finalSize / duration * 1000 / (1024 * 1024));

    console.log('Upload completed:', {
      finalSize,
      duration: `${Math.round(duration / 1000)}s`,
      speed: `${speed} MB/s`
    });

    res.status(200).json({
      message: 'File upload completed',
      details: {
        isComplete: true,
        status: 'complete',
        fileSize: finalSize
      }
    });

  } catch (error) {
    console.error('Upload error:', error);

    // Clean up write stream and file
    if (writeStream) {
      writeStream.end();
    }

    // Send error response if headers haven't been sent
    if (!res.headersSent) {
      res.status(500).json({
        error: 'UPLOAD_ERROR',
        message: error.message
      });
    }
  }

  // Handle connection close/abort
  req.on('close', () => {
    if (writeStream) {
      writeStream.end();
    }
  });
};

// SSL file upload middleware (Promise-based)
const uploadSSLMiddleware = (req, res) => {
  return new Promise((resolve, reject) => {
    upload(req, res, (err) => {
      if (err) {
        console.error('SSL upload error:', {
          message: err.message,
          code: err.code,
          stack: err.stack
        });
        reject(err);
        return;
      }

      if (!req.file) {
        const error = new Error('No file uploaded');
        console.error('SSL upload error:', {
          message: error.message,
          headers: req.headers,
          body: req.body
        });
        reject(error);
        return;
      }

      if (req.file.size === 0) {
        const error = new Error('Empty file uploaded');
        console.error('SSL upload error:', {
          message: error.message,
          file: req.file
        });
        fs.unlink(req.file.path, (unlinkErr) => {
          if (unlinkErr) console.error('Error deleting empty file:', unlinkErr);
        });
        reject(error);
        return;
      }

      console.log('SSL upload completed:', {
        filename: req.file.filename,
        originalname: req.file.originalname,
        path: req.file.path,
        size: req.file.size,
        mimetype: req.file.mimetype
      });

      resolve(req.file);
    });
  });
};

module.exports = {
  uploadFile: uploadMiddleware,
  uploadSSLFile: uploadSSLMiddleware
};
