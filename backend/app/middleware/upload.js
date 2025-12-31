const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../utils/config-loader');
const { log } = require('../utils/Logger');

// Load app config for max file size
let maxFileSize;
let appConfig;

try {
  appConfig = loadConfig('app');
  maxFileSize = appConfig.boxvault.box_max_file_size.value * 1024 * 1024 * 1024; // Convert GB to bytes
} catch (e) {
  log.error.error(`Failed to load app configuration: ${e.message}`);
  maxFileSize = 10 * 1024 * 1024 * 1024; // Default to 10GB
}

// Helper: Validate request headers
const validateRequest = (isChunked, contentLength) => {
  if (!isChunked) {
    if (isNaN(contentLength)) {
      return {
        valid: false,
        error: {
          status: 400,
          code: 'INVALID_REQUEST',
          message: 'Content-Length header required when not using chunked encoding',
        },
      };
    }

    if (contentLength > maxFileSize) {
      log.app.error('File too large:', {
        contentLength,
        maxFileSize,
        contentLengthGB: Math.round((contentLength / (1024 * 1024 * 1024)) * 100) / 100,
        maxFileSizeGB: maxFileSize / (1024 * 1024 * 1024),
      });

      return {
        valid: false,
        error: {
          status: 413,
          code: 'FILE_TOO_LARGE',
          message: `File size ${Math.round((contentLength / (1024 * 1024 * 1024)) * 100) / 100}GB exceeds maximum allowed size of ${maxFileSize / (1024 * 1024 * 1024)}GB`,
          details: {
            fileSize: contentLength,
            maxFileSize,
            fileSizeGB: Math.round((contentLength / (1024 * 1024 * 1024)) * 100) / 100,
            maxFileSizeGB: maxFileSize / (1024 * 1024 * 1024),
          },
        },
      };
    }
  }

  return { valid: true };
};

// Helper: Merge chunks into final file
const mergeChunks = async (tempDir, finalPath, totalChunks, contentLength) => {
  const chunks = fs.readdirSync(tempDir).filter(f => f.startsWith('chunk-'));

  // Sort chunks by index
  const sortedChunks = chunks
    .map(f => ({ index: parseInt(f.split('-')[1]), path: path.join(tempDir, f) }))
    .sort((a, b) => a.index - b.index);

  // Verify all chunks present
  const missingChunks = [];
  for (let i = 0; i < totalChunks; i++) {
    if (!sortedChunks.find(chunk => chunk.index === i)) {
      missingChunks.push(i);
    }
  }

  if (missingChunks.length > 0) {
    throw new Error(`Missing chunks: ${missingChunks.join(', ')}`);
  }

  log.app.info('Starting file assembly:', {
    totalChunks,
    receivedChunks: chunks.length,
    tempDir,
    finalPath,
    totalSize: sortedChunks.reduce((size, chunk) => size + fs.statSync(chunk.path).size, 0),
  });

  // Ensure upload directory exists
  fs.mkdirSync(path.dirname(finalPath), { recursive: true, mode: 0o755 });

  // Create write stream for final file
  const writeStream = fs.createWriteStream(finalPath, {
    flags: 'w',
    encoding: 'binary',
    mode: 0o666,
    autoClose: true,
  });

  // Merge chunks sequentially
  let assembledSize = 0;
  for (let i = 0; i < sortedChunks.length; i++) {
    const chunk = sortedChunks[i];
    const chunkSize = fs.statSync(chunk.path).size;

    log.app.info(`Merging chunk ${i + 1}/${sortedChunks.length}:`, {
      chunkIndex: chunk.index,
      chunkPath: chunk.path,
      chunkSize,
      assembledSize,
    });

    const chunkContent = fs.readFileSync(chunk.path);
    if (chunkContent.length !== chunkSize) {
      throw new Error(
        `Chunk ${i} size mismatch: expected ${chunkSize}, got ${chunkContent.length}`
      );
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

  log.app.info('Assembly completed:', {
    finalPath,
    assembledSize,
    expectedSize: contentLength || 'unknown',
  });

  return assembledSize;
};

// Helper: Update database with file information
const updateDatabase = async (params, finalSize, headers) => {
  const { versionNumber, boxId, providerName, architectureName } = params;

  const db = require('../models');
  const version = await db.versions.findOne({
    where: { versionNumber },
    include: [
      {
        model: db.box,
        as: 'box',
        where: { name: boxId },
      },
    ],
  });

  if (!version) {
    throw new Error(`Version ${versionNumber} not found for box ${boxId}`);
  }

  const provider = await db.providers.findOne({
    where: {
      name: providerName,
      versionId: version.id,
    },
  });

  if (!provider) {
    throw new Error(`Provider ${providerName} not found`);
  }

  const architecture = await db.architectures.findOne({
    where: {
      name: architectureName,
      providerId: provider.id,
    },
  });

  if (!architecture) {
    throw new Error(`Architecture not found for provider ${providerName}`);
  }

  const fileData = {
    fileName: 'vagrant.box',
    checksum: headers['x-checksum'] || null,
    checksumType: (headers['x-checksum-type'] || 'NULL').toUpperCase(),
    architectureId: architecture.id,
    fileSize: finalSize,
  };

  const fileRecord = await db.files.findOne({
    where: {
      fileName: 'vagrant.box',
      architectureId: architecture.id,
    },
  });

  if (fileRecord) {
    await fileRecord.update(fileData);
  } else {
    await db.files.create(fileData);
  }
};

// Helper: Handle chunked upload
const handleChunkedUpload = async (req, params, tempDir, finalPath, contentLength, startTime) => {
  const chunkIndex = parseInt(req.headers['x-chunk-index']);
  const totalChunks = parseInt(req.headers['x-total-chunks']);

  try {
    // Save chunk to temp file
    const chunkPath = path.join(tempDir, `chunk-${chunkIndex}`);
    const writeStream = fs.createWriteStream(chunkPath, {
      flags: 'w',
      encoding: 'binary',
      mode: 0o666,
      autoClose: true,
    });

    // Write chunk
    await new Promise((resolve, reject) => {
      req.pipe(writeStream).on('finish', resolve).on('error', reject);
    });

    // Check if all chunks received
    const chunks = fs.readdirSync(tempDir).filter(f => f.startsWith('chunk-'));
    log.app.info('Chunk upload status:', {
      received: chunks.length,
      total: totalChunks,
      current: chunkIndex,
    });

    if (chunks.length === totalChunks) {
      // Merge chunks
      const finalSize = await mergeChunks(tempDir, finalPath, totalChunks, contentLength);

      // Clean up temp directory
      log.app.info('Cleaning up temp directory:', tempDir);
      fs.rmdirSync(tempDir);

      // Verify against max file size
      if (finalSize > maxFileSize) {
        fs.unlinkSync(finalPath);
        throw new Error(`File size cannot exceed ${maxFileSize / (1024 * 1024 * 1024)}GB`);
      }

      // Update database
      await updateDatabase(params, finalSize, req.headers);

      // Calculate stats
      const duration = Date.now() - startTime;
      const speed = Math.round(((finalSize / duration) * 1000) / (1024 * 1024));

      log.app.info('Upload completed:', {
        finalSize,
        duration: `${Math.round(duration / 1000)}s`,
        speed: `${speed} MB/s`,
      });

      return {
        isComplete: true,
        response: {
          message: 'File upload completed',
          details: {
            isComplete: true,
            status: 'complete',
            fileSize: finalSize,
          },
        },
      };
    }

    // Return chunk success response
    return {
      isComplete: false,
      response: {
        message: 'Chunk upload completed',
        details: {
          isComplete: false,
          status: 'uploading',
          chunksReceived: chunks.length,
          totalChunks,
          currentChunk: chunkIndex,
        },
      },
    };
  } catch (error) {
    // Clean up temp files on error
    try {
      if (fs.existsSync(tempDir)) {
        const chunks = fs.readdirSync(tempDir);
        chunks.forEach(chunk => fs.unlinkSync(path.join(tempDir, chunk)));
        fs.rmdirSync(tempDir);
      }
    } catch (cleanupError) {
      log.error.error('Error cleaning up temp files:', cleanupError);
    }
    throw error;
  }
};

// Helper: Handle single file upload
const handleSingleUpload = async (req, params, finalPath, contentLength, isChunked, startTime) => {
  // Single file upload
  const writeStream = fs.createWriteStream(finalPath, {
    flags: 'w',
    encoding: 'binary',
    mode: 0o666,
    autoClose: true,
  });

  // Write file
  await new Promise((resolve, reject) => {
    req.pipe(writeStream).on('finish', resolve).on('error', reject);
  });

  // Verify file size
  const finalSize = fs.statSync(finalPath).size;

  // For non-chunked uploads, verify against Content-Length
  if (!isChunked && !isNaN(contentLength)) {
    const maxDiff = Math.max(1024 * 1024, contentLength * 0.01);
    if (Math.abs(finalSize - contentLength) > maxDiff) {
      fs.unlinkSync(finalPath);
      throw new Error(
        `File size mismatch: Expected ${contentLength} bytes but got ${finalSize} bytes`
      );
    }
  }

  // Verify against max file size
  if (finalSize > maxFileSize) {
    fs.unlinkSync(finalPath);
    throw new Error(`File size cannot exceed ${maxFileSize / (1024 * 1024 * 1024)}GB`);
  }

  // Update database
  await updateDatabase(params, finalSize, req.headers);

  // Calculate stats
  const duration = Date.now() - startTime;
  const speed = Math.round(((finalSize / duration) * 1000) / (1024 * 1024));

  log.app.info('Upload completed:', {
    finalSize,
    duration: `${Math.round(duration / 1000)}s`,
    speed: `${speed} MB/s`,
  });

  return {
    isComplete: true,
    response: {
      message: 'File upload completed',
      details: {
        isComplete: true,
        status: 'complete',
        fileSize: finalSize,
      },
    },
  };
};

// Main upload middleware that streams directly to disk
const uploadMiddleware = async (req, res) => {
  log.app.info('=== UPLOAD MIDDLEWARE ENTRY ===', {
    method: req.method,
    url: req.url,
    headers: {
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length'],
      'transfer-encoding': req.headers['transfer-encoding'],
      'x-checksum': req.headers['x-checksum'],
      'x-checksum-type': req.headers['x-checksum-type'],
      'x-file-name': req.headers['x-file-name'],
    },
  });

  // Disable request timeouts
  req.setTimeout(0);
  res.setTimeout(0);

  // Prevent request from being parsed by body-parser
  req._body = true;

  const startTime = Date.now();
  let writeStream;
  let finalPath;

  try {
    const { organization, boxId, versionNumber, providerName, architectureName } = req.params;

    log.app.info('Upload middleware processing request for:', {
      organization,
      boxId,
      versionNumber,
      providerName,
      architectureName,
    });

    // Check if using chunked encoding
    const isChunked = req.headers['transfer-encoding'] === 'chunked';
    const contentLength = parseInt(req.headers['content-length']);

    log.app.info('Upload encoding analysis:', {
      isChunked,
      contentLength,
      contentLengthRaw: req.headers['content-length'],
    });

    // Validate request
    const validation = validateRequest(isChunked, contentLength);
    if (!validation.valid) {
      res.setHeader('Connection', 'close');
      res.setHeader('Content-Type', 'application/json');
      return res.status(validation.error.status).json({
        error: validation.error.code,
        message: validation.error.message,
        details: validation.error.details,
      });
    }

    // Load config and prepare upload directory
    log.app.info('Loading config and preparing upload directory...');
    const config = loadConfig('app');
    const uploadDir = path.join(
      config.boxvault.box_storage_directory.value,
      organization,
      boxId,
      versionNumber,
      providerName,
      architectureName
    );

    log.app.info('Creating upload directory:', { uploadDir });
    fs.mkdirSync(uploadDir, { recursive: true, mode: 0o755 });
    finalPath = path.join(uploadDir, 'vagrant.box');

    // Get chunk information from headers
    const chunkIndex = parseInt(req.headers['x-chunk-index']);
    const totalChunks = parseInt(req.headers['x-total-chunks']);
    const isMultipart = !isNaN(chunkIndex) && !isNaN(totalChunks);

    log.app.info('Chunk analysis:', {
      chunkIndex,
      totalChunks,
      isMultipart,
    });

    // Create temp directory for chunks if needed
    const tempDir = path.join(uploadDir, '.temp');
    if (isMultipart) {
      log.app.info('Creating temp directory for chunks:', { tempDir });
      fs.mkdirSync(tempDir, { recursive: true, mode: 0o755 });
    }

    // Log upload start
    log.app.info('=== STARTING FILE UPLOAD PROCESS ===', {
      fileName: req.headers['x-file-name'] || 'vagrant.box',
      fileSize: contentLength,
      checksum: req.headers['x-checksum'] || 'none',
      checksumType: req.headers['x-checksum-type'] || 'NULL',
      path: finalPath,
      isMultipart,
      chunkIndex: isMultipart ? chunkIndex : 'N/A',
      totalChunks: isMultipart ? totalChunks : 'N/A',
    });

    let result;
    if (isMultipart) {
      result = await handleChunkedUpload(
        req,
        req.params,
        tempDir,
        finalPath,
        contentLength,
        startTime
      );
    } else {
      result = await handleSingleUpload(
        req,
        req.params,
        finalPath,
        contentLength,
        isChunked,
        startTime
      );
    }

    // Handle connection close/abort
    req.on('close', () => {
      if (writeStream) {
        writeStream.end();
      }
    });

    return res.status(200).json(result.response);
  } catch (error) {
    log.error.error('Upload error:', error);

    // Clean up on error
    if (writeStream) {
      writeStream.end();
    }

    // Clean up incomplete file if it exists
    if (finalPath && fs.existsSync(finalPath)) {
      if (error.message.includes('size mismatch') || error.message.includes('closed prematurely')) {
        try {
          fs.unlinkSync(finalPath);
          log.app.info('Cleaned up incomplete file:', finalPath);
        } catch (cleanupError) {
          log.error.error('Error cleaning up file:', cleanupError);
        }
      }
    }

    // Handle connection close/abort
    req.on('close', () => {
      if (writeStream) {
        writeStream.end();
      }
    });

    // Send error response if headers haven't been sent
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'UPLOAD_ERROR',
        message: error.message,
      });
    }

    return undefined;
  }
};

// SSL file upload middleware (Promise-based)
const uploadSSLMiddleware = async (req, res) => {
  try {
    await uploadMiddleware(req, res);
    return undefined;
  } catch (error) {
    log.error.error('SSL upload error:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'UPLOAD_ERROR',
        message: error.message,
      });
    }

    return undefined;
  }
};

module.exports = {
  uploadFile: uploadMiddleware,
  uploadSSLFile: uploadSSLMiddleware,
};
