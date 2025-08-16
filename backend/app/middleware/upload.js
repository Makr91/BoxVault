const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../utils/config-loader');

// Load app config for max file size
let maxFileSize;
let appConfig;

try {
  appConfig = loadConfig('app');
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
    
    // Check if using chunked encoding
    const isChunked = req.headers['transfer-encoding'] === 'chunked';
    const contentLength = parseInt(req.headers['content-length']);

    // Only validate content-length if not using chunked encoding
    if (!isChunked) {
      if (isNaN(contentLength)) {
        return res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'Content-Length header required when not using chunked encoding'
        });
      }

      if (contentLength > maxFileSize) {
        return res.status(413).json({
          error: 'FILE_TOO_LARGE',
          message: `File size cannot exceed ${maxFileSize / (1024 * 1024 * 1024)}GB`
        });
      }
    }

    // Load config and prepare upload directory
    const config = loadConfig('app');
    const uploadDir = path.join(config.boxvault.box_storage_directory.value, organization, boxId, versionNumber, providerName, architectureName);
    fs.mkdirSync(uploadDir, { recursive: true, mode: 0o755 });
    const finalPath = path.join(uploadDir, 'vagrant.box');

    // Get chunk information from headers
    const chunkIndex = parseInt(req.headers['x-chunk-index']);
    const totalChunks = parseInt(req.headers['x-total-chunks']);
    const isMultipart = !isNaN(chunkIndex) && !isNaN(totalChunks);

    // Create temp directory for chunks if needed
    const tempDir = path.join(uploadDir, '.temp');
    if (isMultipart) {
      fs.mkdirSync(tempDir, { recursive: true, mode: 0o755 });
    }

    // Log upload start
    console.log('Starting file upload:', {
      fileName: req.headers['x-file-name'] || 'vagrant.box',
      fileSize: contentLength,
      checksum: req.headers['x-checksum'] || 'none',
      checksumType: req.headers['x-checksum-type'] || 'NULL',
      path: finalPath,
      isMultipart,
      chunkIndex: isMultipart ? chunkIndex : 'N/A',
      totalChunks: isMultipart ? totalChunks : 'N/A'
    });

    if (isMultipart) {
      try {
        // Save chunk to temp file
        const chunkPath = path.join(tempDir, `chunk-${chunkIndex}`);
        writeStream = fs.createWriteStream(chunkPath, {
          flags: 'w',
          encoding: 'binary',
          mode: 0o666,
          autoClose: true
        });

        // Write chunk
        await new Promise((resolve, reject) => {
          req.pipe(writeStream)
            .on('finish', resolve)
            .on('error', reject);
        });

        // Check if all chunks received
        const chunks = fs.readdirSync(tempDir).filter(f => f.startsWith('chunk-'));
        console.log('Chunk upload status:', {
          received: chunks.length,
          total: totalChunks,
          current: chunkIndex
        });

        if (chunks.length === totalChunks) {
          // Merge chunks
          writeStream = fs.createWriteStream(finalPath, {
            flags: 'w',
            encoding: 'binary',
            mode: 0o666,
            autoClose: true
          });

          try {
            // Sort chunks by index to ensure correct order
            const sortedChunks = chunks
              .map(f => ({ index: parseInt(f.split('-')[1]), path: path.join(tempDir, f) }))
              .sort((a, b) => a.index - b.index);

            // Verify we have all chunks in sequence
            const missingChunks = [];
            for (let i = 0; i < totalChunks; i++) {
              if (!sortedChunks.find(chunk => chunk.index === i)) {
                missingChunks.push(i);
              }
            }

            if (missingChunks.length > 0) {
              throw new Error(`Missing chunks: ${missingChunks.join(', ')}`);
            }

            console.log('Starting file assembly:', {
              totalChunks,
              receivedChunks: chunks.length,
              uploadDir,
              tempDir,
              finalPath,
              totalSize: sortedChunks.reduce((size, chunk) => size + fs.statSync(chunk.path).size, 0)
            });

            // Ensure upload directory exists
            fs.mkdirSync(path.dirname(finalPath), { recursive: true, mode: 0o755 });

            // Create write stream for final file
            writeStream = fs.createWriteStream(finalPath, {
              flags: 'w',
              encoding: 'binary',
              mode: 0o666,
              autoClose: true
            });

            // Merge chunks sequentially with verification
            let assembledSize = 0;
            for (let i = 0; i < sortedChunks.length; i++) {
              const chunk = sortedChunks[i];
              const chunkSize = fs.statSync(chunk.path).size;
              
              console.log(`Merging chunk ${i + 1}/${sortedChunks.length}:`, {
                chunkIndex: chunk.index,
                chunkPath: chunk.path,
                chunkSize,
                assembledSize
              });

              const chunkContent = fs.readFileSync(chunk.path);
              if (chunkContent.length !== chunkSize) {
                throw new Error(`Chunk ${i} size mismatch: expected ${chunkSize}, got ${chunkContent.length}`);
              }

              writeStream.write(chunkContent);
              assembledSize += chunkContent.length;
              fs.unlinkSync(chunk.path); // Delete chunk after merging
            }

            // Finish write stream
            await new Promise((resolve, reject) => {
              writeStream.end();
              writeStream.on('finish', resolve);
              writeStream.on('error', reject);
            });

            console.log('Assembly completed:', {
              finalPath,
              assembledSize,
              expectedSize: contentLength || 'unknown'
            });

            // Clean up temp directory
            console.log('Cleaning up temp directory:', tempDir);
            fs.rmdirSync(tempDir);
          } catch (error) {
            console.error('Assembly failed:', error);
            
            // Clean up failed assembly
            if (fs.existsSync(finalPath)) {
              fs.unlinkSync(finalPath);
            }
            
            // Clean up temp directory
            if (fs.existsSync(tempDir)) {
              const remainingChunks = fs.readdirSync(tempDir);
              remainingChunks.forEach(chunk => fs.unlinkSync(path.join(tempDir, chunk)));
              fs.rmdirSync(tempDir);
            }
            
            throw error;
          }

          // File is complete, proceed with verification and database updates
          const finalSize = fs.statSync(finalPath).size;

          // Verify against max file size
          if (finalSize > maxFileSize) {
            fs.unlinkSync(finalPath);
            throw new Error(`File size cannot exceed ${maxFileSize / (1024 * 1024 * 1024)}GB`);
          }

          // Update database (only load models when needed)
          const db = require("../models");
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

          // Return final success response
          return res.status(200).json({
            message: 'File upload completed',
            details: {
              isComplete: true,
              status: 'complete',
              fileSize: finalSize
            }
          });
        }

        // Return chunk success response
        return res.status(200).json({
          message: 'Chunk upload completed',
          details: {
            isComplete: false,
            status: 'uploading',
            chunksReceived: chunks.length,
            totalChunks: totalChunks,
            currentChunk: chunkIndex
          }
        });
      } catch (error) {
        // Clean up temp files on error
        try {
          if (fs.existsSync(tempDir)) {
            const chunks = fs.readdirSync(tempDir);
            chunks.forEach(chunk => fs.unlinkSync(path.join(tempDir, chunk)));
            fs.rmdirSync(tempDir);
          }
        } catch (cleanupError) {
          console.error('Error cleaning up temp files:', cleanupError);
        }
        throw error;
      }
    } else {
      // Single file upload
      writeStream = fs.createWriteStream(finalPath, {
        flags: 'w',
        encoding: 'binary',
        mode: 0o666,
        autoClose: true
      });

      // Write file
      await new Promise((resolve, reject) => {
        req.pipe(writeStream)
          .on('finish', resolve)
          .on('error', reject);
      });

      // Verify file size
      const finalSize = fs.statSync(finalPath).size;

      // For non-chunked uploads, verify against Content-Length
      if (!isChunked && !isNaN(contentLength)) {
        const maxDiff = Math.max(1024 * 1024, contentLength * 0.01);
        if (Math.abs(finalSize - contentLength) > maxDiff) {
          fs.unlinkSync(finalPath);
          throw new Error(`File size mismatch: Expected ${contentLength} bytes but got ${finalSize} bytes`);
        }
      }

      // Verify against max file size
      if (finalSize > maxFileSize) {
        fs.unlinkSync(finalPath);
        throw new Error(`File size cannot exceed ${maxFileSize / (1024 * 1024 * 1024)}GB`);
      }

      // Update database (only load models when needed)
      const db = require("../models");
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

      // Return success response
      return res.status(200).json({
        message: 'File upload completed',
        details: {
          isComplete: true,
          status: 'complete',
          fileSize: finalSize
        }
      });
    }
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
