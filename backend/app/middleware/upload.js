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

    // Create write stream with optimized settings
    writeStream = fs.createWriteStream(finalPath, {
      flags: 'w',
      encoding: 'binary',
      mode: 0o666,
      autoClose: true,
      emitClose: true,
      highWaterMark: 64 * 1024 * 1024 // 64MB chunks
    });

    // Log upload start
    console.log('Starting file upload:', {
      fileName: req.headers['x-file-name'] || 'vagrant.box',
      fileSize: contentLength,
      checksum: req.headers['x-checksum'] || 'none',
      checksumType: req.headers['x-checksum-type'] || 'NULL',
      path: finalPath
    });

    // Set up progress tracking
    let lastLogged = 0;
    let lastTime = Date.now();
    
    // Use pipe() for efficient streaming with error handling
    await new Promise((resolve, reject) => {
      // Handle data chunks and track progress
      req.on('data', chunk => {
        uploadedBytes += chunk.length;
        
        // Log progress every 1GB or every 5 seconds
        const now = Date.now();
        const timeDiff = now - lastTime;
        const currentProgress = Math.floor((uploadedBytes / contentLength) * 100);
        
        if (uploadedBytes - lastLogged >= 1024 * 1024 * 1024 || timeDiff >= 5000) {
          const speed = ((uploadedBytes - lastLogged) / (1024 * 1024)) / (timeDiff / 1000); // MB/s
          console.log('Upload progress:', {
            uploadedBytes,
            totalBytes: contentLength,
            progress: `${currentProgress}%`,
            speed: `${Math.round(speed)} MB/s`
          });
          lastLogged = uploadedBytes;
          lastTime = now;
        }
      });

      // Handle stream completion
      writeStream.on('finish', () => {
        console.log('Write stream finished');
        resolve();
      });

      // Handle write stream errors
      writeStream.on('error', err => {
        console.error('Write stream error:', err);
        writeStream.end();
        reject(err);
      });

      // Handle request errors
      req.on('error', err => {
        console.error('Request error:', err);
        writeStream.end();
        reject(err);
      });

      // Handle socket errors
      req.socket.on('error', err => {
        console.error('Socket error:', err);
        writeStream.end();
        reject(err);
      });

      // Handle premature connection close
      req.on('close', () => {
        if (uploadedBytes < contentLength) {
          const error = new Error('Connection closed prematurely');
          error.bytesUploaded = uploadedBytes;
          error.totalBytes = contentLength;
          error.progress = `${Math.round((uploadedBytes / contentLength) * 100)}%`;
          console.error('Upload interrupted:', error);
          writeStream.end();
          reject(error);
        }
      });

      // Handle pipe errors and ensure proper end event
      const stream = req.pipe(writeStream);
      stream.on('error', err => {
        console.error('Pipe error:', err);
        writeStream.end();
        reject(err);
      });

      // Ensure end event is handled
      req.on('end', () => {
        if (uploadedBytes === contentLength) {
          console.log('Upload completed successfully');
        }
      });
    });

    // Verify file size
    const finalSize = fs.statSync(finalPath).size;
    const maxDiff = Math.max(1024 * 1024, contentLength * 0.01); // Allow 1MB or 1% difference, whichever is larger
    
    if (Math.abs(finalSize - contentLength) > maxDiff) {
      // Log size mismatch details
      console.error('Size mismatch:', {
        expectedSize: contentLength,
        actualSize: finalSize,
        difference: Math.abs(finalSize - contentLength),
        maxAllowedDiff: maxDiff
      });
      
      // Clean up the incomplete file
      fs.unlinkSync(finalPath);
      
      throw new Error(`File size mismatch: Expected ${contentLength} bytes but got ${finalSize} bytes`);
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

    // Clean up on error
    if (writeStream) {
      writeStream.end();
    }
    
    // Clean up incomplete file if it exists
    if (error.message.includes('size mismatch') || error.message.includes('closed prematurely')) {
      try {
        if (fs.existsSync(finalPath)) {
          fs.unlinkSync(finalPath);
          console.log('Cleaned up incomplete file:', finalPath);
        }
      } catch (cleanupError) {
        console.error('Error cleaning up file:', cleanupError);
      }
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
