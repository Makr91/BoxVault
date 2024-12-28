const multer = require("multer");
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const crypto = require('crypto');
const db = require("../models");
const { Architecture, File } = db;

// Load app config for max file size
const appConfigPath = path.join(__dirname, '../config/app.config.yaml');
let maxFileSize;
let appConfig;
const CHUNK_SIZE = 100 * 1024 * 1024; // 100MB chunks

try {
  const fileContents = fs.readFileSync(appConfigPath, 'utf8');
  appConfig = yaml.load(fileContents);
  maxFileSize = appConfig.boxvault.box_max_file_size.value * 1024 * 1024 * 1024; // Convert GB to bytes
} catch (e) {
  console.error(`Failed to load app configuration: ${e.message}`);
  maxFileSize = 10 * 1024 * 1024 * 1024; // Default to 10GB
}

// Helper function to get chunk directory path
const getChunkDir = (uploadDir, fileId) => {
  return path.join(uploadDir, `.chunks-${fileId}`);
};

// Helper function to get final file path
const getFinalFilePath = (uploadDir) => {
  return path.join(uploadDir, 'vagrant.box');
};

// Helper function to assemble chunks
const assembleChunks = async (chunkDir, finalPath, totalChunks) => {
  console.log('Starting file assembly:', {
    chunkDir,
    finalPath,
    totalChunks,
    startTime: new Date().toISOString(),
    totalSize: fs.readdirSync(chunkDir)
      .filter(f => f.startsWith('chunk-'))
      .reduce((acc, f) => acc + fs.statSync(path.join(chunkDir, f)).size, 0)
  });

  const writeStream = fs.createWriteStream(finalPath);
  const startTime = Date.now();
  let processedSize = 0;
  
  for (let i = 0; i < totalChunks; i++) {
    const chunkPath = path.join(chunkDir, `chunk-${i}`);
    if (!fs.existsSync(chunkPath)) {
      throw new Error(`Missing chunk ${i}`);
    }
    const chunkSize = fs.statSync(chunkPath).size;
    await new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(chunkPath);
      readStream.pipe(writeStream, { end: false });
      readStream.on('end', () => {
        processedSize += chunkSize;
        console.log('Chunk assembled:', {
          chunkIndex: i,
          chunkSize,
          processedSize,
          remainingChunks: totalChunks - (i + 1),
          elapsedTime: Math.round((Date.now() - startTime) / 1000) + 's'
        });
        resolve();
      });
      readStream.on('error', reject);
    });
  }
  
  writeStream.end();
  return new Promise((resolve, reject) => {
    writeStream.on('finish', () => {
      const finalSize = fs.statSync(finalPath).size;
      console.log('File assembly completed:', {
        finalPath,
        finalSize,
        elapsedTime: Math.round((Date.now() - startTime) / 1000) + 's',
        averageSpeed: Math.round(finalSize / (Date.now() - startTime) * 1000 / (1024 * 1024)) + ' MB/s'
      });
      resolve();
    });
    writeStream.on('error', reject);
  });
};

// Configure multer storage for chunked uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
      
      // Get chunk info from either form data or headers
      const fileId = req.body.fileId || req.headers['x-file-id'];
      const chunkIndex = req.body.chunkIndex || req.headers['x-chunk-index'];
      const totalChunks = req.body.totalChunks || req.headers['x-total-chunks'];
      
      if (!fileId || chunkIndex === undefined || !totalChunks) {
        console.error('Missing chunk information in storage:', {
          fromBody: {
            fileId: req.body.fileId,
            chunkIndex: req.body.chunkIndex,
            totalChunks: req.body.totalChunks
          },
          fromHeaders: {
      fileId: req.headers['x-file-id'] || '(from form data)',
      chunkIndex: req.headers['x-chunk-index'] || '(from form data)',
      totalChunks: req.headers['x-total-chunks'] || '(from form data)',
      contentRange: req.headers['content-range'] || 'none'
          }
        });
        return cb(new Error('Missing chunk information'));
      }

      // Load config for each request to ensure we have the latest
      const configContents = fs.readFileSync(appConfigPath, 'utf8');
      const config = yaml.load(configContents);
      const uploadDir = path.join(config.boxvault.box_storage_directory.value, organization, boxId, versionNumber, providerName, architectureName);
      
      // Create main upload directory
      fs.mkdirSync(uploadDir, { recursive: true, mode: 0o755 });
      
      // Create chunks directory
      const chunkDir = getChunkDir(uploadDir, fileId);
      fs.mkdirSync(chunkDir, { recursive: true, mode: 0o755 });
      
      // Log directory creation/access
      console.log('Using chunk directory:', {
        path: chunkDir,
        mode: '0755',
        exists: fs.existsSync(chunkDir),
        chunk: chunkIndex,
        totalChunks
      });
      
      cb(null, chunkDir);
    } catch (error) {
      console.error('Error in multer destination handler:', error);
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    try {
      // Get chunk index from either form data or headers
      const chunkIndex = req.body.chunkIndex || req.headers['x-chunk-index'];
      if (chunkIndex === undefined) {
        console.error('Missing chunk index in filename handler');
        return cb(new Error('Missing chunk index'));
      }
      // Store each chunk with its index
      cb(null, `chunk-${chunkIndex}`);
    } catch (error) {
      console.error('Error in multer filename handler:', error);
      cb(error);
    }
  }
});

// Configure multer upload with chunk handling
const upload = multer({
  storage: storage,
  limits: {
    fileSize: CHUNK_SIZE + 1024, // Chunk size plus some overhead
    fieldSize: maxFileSize // Keep original field size limit
  },
  fileFilter: (req, file, cb) => {
    try {
      // Get chunk info from either form data or headers
      const fileId = req.body.fileId || req.headers['x-file-id'];
      const chunkIndex = req.body.chunkIndex || req.headers['x-chunk-index'];
      const totalChunks = req.body.totalChunks || req.headers['x-total-chunks'];
      
      // Validate chunk information
      if (!fileId || chunkIndex === undefined || !totalChunks) {
        console.error('Missing chunk information:', { 
          fileId, 
          chunkIndex, 
          totalChunks,
          fromBody: { 
            fileId: req.body.fileId,
            chunkIndex: req.body.chunkIndex,
            totalChunks: req.body.totalChunks 
          },
          fromHeaders: {
            fileId: req.headers['x-file-id'],
            chunkIndex: req.headers['x-chunk-index'],
            totalChunks: req.headers['x-total-chunks']
          }
        });
        return cb(new Error('Missing chunk information'));
      }

      // Store chunk info on request for later use
      req.chunkInfo = {
        fileId,
        chunkIndex: parseInt(chunkIndex),
        totalChunks: parseInt(totalChunks)
      };

      // Log chunk upload start
      console.log('Starting chunk upload:', {
        originalName: file.originalname,
        mimeType: file.mimetype,
        fieldname: file.fieldname,
        ...req.chunkInfo,
        params: req.params
      });

      // Verify file field name
      if (file.fieldname !== 'file') {
        console.error('Invalid field name:', file.fieldname);
        return cb(new Error('Invalid field name for file upload'));
      }

      cb(null, true);
    } catch (error) {
      console.error('Error in multer fileFilter:', error);
      cb(error);
    }
  }
}).single('file');

// Main upload middleware with chunk handling
const uploadMiddleware = (req, res, next) => {
  const startTime = Date.now();
  
  // Log chunk upload request with metadata from headers
  console.log('Chunk upload request received:', {
    params: req.params,
    contentLength: req.headers['content-length'],
    contentType: req.headers['content-type'],
    chunkInfo: {
      fileId: req.headers['x-file-id'] || '(from form data)',
      chunkIndex: req.headers['x-chunk-index'] || '(from form data)',
      totalChunks: req.headers['x-total-chunks'] || '(from form data)',
      contentRange: req.headers['content-range'] || 'none'
    }
  });

  try {
    upload(req, res, async (err) => {
      const duration = Date.now() - startTime;
      
      if (err) {
        console.error('Chunk upload error:', {
          type: err instanceof multer.MulterError ? 'MulterError' : 'GeneralError',
          message: err.message,
          code: err.code,
          duration: duration
        });

        if (!res.headersSent) {
          if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({
              error: 'CHUNK_TOO_LARGE',
              message: `Chunk size cannot be larger than ${CHUNK_SIZE / (1024 * 1024)}MB`,
              details: { maxChunkSize: CHUNK_SIZE }
            });
          } else {
            res.status(500).json({
              error: 'CHUNK_UPLOAD_ERROR',
              message: err.message
            });
          }
        }
        return;
      }

      if (!req.file) {
        if (!res.headersSent) {
          res.status(400).json({
            error: 'NO_CHUNK',
            message: 'No chunk was uploaded'
          });
        }
        return;
      }

      const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
      const { fileId, chunkIndex, totalChunks } = req.chunkInfo;
      const uploadDir = path.join(appConfig.boxvault.box_storage_directory.value, organization, boxId, versionNumber, providerName, architectureName);
      const chunkDir = getChunkDir(uploadDir, fileId);

      // Check if this was the last chunk
      const uploadedChunks = fs.readdirSync(chunkDir).filter(f => f.startsWith('chunk-')).length;
      console.log('Checking completion:', {
        uploadedChunks,
        totalChunks,
        isComplete: uploadedChunks === totalChunks,
        chunkDir,
        files: fs.readdirSync(chunkDir)
      });
      
      if (uploadedChunks === totalChunks) { // totalChunks is already parsed as int in fileFilter
        try {
          try {
            // Assemble the file first
            const finalPath = getFinalFilePath(uploadDir);
            await assembleChunks(chunkDir, finalPath, parseInt(totalChunks));
            
            // Clean up chunks
            fs.rmSync(chunkDir, { recursive: true, force: true });
            
            console.log('File assembly completed:', {
              fileId,
              totalChunks,
              finalPath,
              finalSize: fs.statSync(finalPath).size,
              duration: Date.now() - startTime
            });

            // Create database record directly here instead of using next()
            const architecture = await Architecture.findOne({
              where: { name: architectureName },
              include: [{
                model: db.providers,
                as: "provider",
                where: { name: providerName },
                include: [{
                  model: db.versions,
                  as: "version",
                  where: { versionNumber },
                  include: [{
                    model: db.box,
                    as: "box",
                    where: { name: boxId },
                    include: [{
                      model: db.user,
                      as: "user",
                      include: [{
                        model: db.organization,
                        as: "organization",
                        where: { name: organization }
                      }]
                    }]
                  }]
                }]
              }]
            });

            if (!architecture) {
              throw new Error(`Architecture not found for provider ${providerName}`);
            }

            // Create or update file record
            const fileRecord = await File.findOne({
              where: {
                fileName: 'vagrant.box',
                architectureId: architecture.id
              }
            });

            const fileSize = fs.statSync(finalPath).size;
            const fileData = {
              fileName: 'vagrant.box',
              checksum: req.body.checksum || null,
              checksumType: (req.body.checksumType || 'NULL').toUpperCase(),
              architectureId: architecture.id,
              fileSize
            };

            if (fileRecord) {
              await fileRecord.update(fileData);
              console.log('File record updated:', fileData);
            } else {
              await File.create(fileData);
              console.log('File record created:', fileData);
            }

            // Send completion response matching frontend expectations
            res.status(200).json({
              message: 'Chunk uploaded successfully',
              details: {
                chunkIndex,
                uploadedChunks,
                totalChunks,
                isComplete: true,
                status: 'complete',
                remainingChunks: 0,
                fileSize: fileSize
              }
            });

          } catch (error) {
            console.error('Error during file assembly or database update:', error);
            // Can't send error response since we already sent assembly status
            // Just log it and let the client handle timeout
          }
        } catch (assemblyError) {
          console.error('File assembly error:', assemblyError);
          if (!res.headersSent) {
            res.status(500).json({
              error: 'ASSEMBLY_ERROR',
              message: 'Failed to assemble chunks into final file'
            });
          }
        }
      } else {
        // Not all chunks received yet, send success for this chunk
        res.status(200).json({
          message: 'Chunk uploaded successfully',
          details: {
            chunkIndex,
            uploadedChunks,
            totalChunks,
            isComplete: false,
            status: 'in_progress',
            remainingChunks: totalChunks - uploadedChunks
          }
        });
      }
    });
  } catch (error) {
    console.error('Unexpected error in upload middleware:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred during upload'
      });
    }
  }
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
