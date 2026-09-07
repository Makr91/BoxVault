import { readdirSync, statSync, createWriteStream, createReadStream } from 'fs';
import { createHash } from 'crypto';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { join, dirname } from 'path';
import { loadConfig } from '../utils/config-loader.js';
import { log } from '../utils/Logger.js';
import { getSecureBoxPath } from '../utils/paths.js';
import { problem } from '../utils/problem.js';
import { safeUnlink, safeRmdirSync, ensureDirSync, safeExistsSync } from '../utils/fsHelper.js';
import db from '../models/index.js';
const { versions, box, providers, architectures, files } = db;

const CHECKSUM_ALGORITHMS = {
  md5: 'md5',
  sha1: 'sha1',
  sha256: 'sha256',
  sha384: 'sha384',
  sha512: 'sha512',
};
const NO_CHECKSUM_TYPE = 'null';
const COUNT_PATTERN = /^\d+$/;

const checksumAlgorithm = checksumType =>
  CHECKSUM_ALGORITHMS[String(checksumType).toLowerCase().replace('-', '')] || null;

/**
 * The failing rules of the upload headers: an x-checksum-type outside the
 * supported algorithms (NULL declares none), and for a chunked upload an
 * x-total-chunks below 1 or an x-chunk-index that is not an integer within
 * 0 and x-total-chunks - 1.
 * @param {Object} headers - The request headers
 * @returns {Array<{pointer: string, rule: string, params: Object}>} Failing rules, or none
 */
const headerErrors = headers => {
  const errors = [];
  const checksumType = headers['x-checksum-type'];
  if (
    checksumType !== undefined &&
    checksumType.toLowerCase() !== NO_CHECKSUM_TYPE &&
    !checksumAlgorithm(checksumType)
  ) {
    errors.push({
      pointer: '/x-checksum-type',
      rule: 'enum',
      params: { enum: Object.keys(CHECKSUM_ALGORITHMS).join(', ') },
    });
  }
  const rawIndex = headers['x-chunk-index'];
  const rawTotal = headers['x-total-chunks'];
  if (rawIndex === undefined && rawTotal === undefined) {
    return errors;
  }
  const total = COUNT_PATTERN.test(rawTotal) ? Number(rawTotal) : null;
  const index = COUNT_PATTERN.test(rawIndex) ? Number(rawIndex) : null;
  if (total === null || total < 1) {
    errors.push({ pointer: '/x-total-chunks', rule: 'minimum', params: { minimum: 1 } });
  }
  if (index === null) {
    errors.push({ pointer: '/x-chunk-index', rule: 'type', params: { type: 'integer' } });
  } else if (total !== null && total >= 1 && index >= total) {
    errors.push({
      pointer: '/x-chunk-index',
      rule: 'range',
      params: { minimum: 0, maximum: total - 1 },
    });
  }
  return errors;
};

// Load app config for max file size
const getMaxFileSize = () => {
  try {
    const appConfig = loadConfig('app');
    return appConfig.boxvault.box_max_file_size * 1024 * 1024 * 1024; // Convert GB to bytes
  } catch (e) {
    log.error.error(`Failed to load app configuration: ${e.message}`);
    return 10 * 1024 * 1024 * 1024; // Default to 10GB
  }
};

/**
 * The problem refusing a non-chunked upload: bad-request without a
 * Content-Length, payload-too-large above the configured maximum.
 * @param {import('express').Request} req - The request (i18n)
 * @param {boolean} isChunked - Whether the body uses chunked transfer encoding
 * @param {number} contentLength - The parsed Content-Length header
 * @param {number} maxFileSize - The maximum upload size in bytes
 * @returns {{status: number, type: string, title?: string}|null} The problem, or null when the request may proceed
 */
const validateRequest = (req, isChunked, contentLength, maxFileSize) => {
  if (isChunked) {
    return null;
  }

  if (isNaN(contentLength)) {
    return { status: 400, type: 'bad-request' };
  }

  if (contentLength > maxFileSize) {
    const maxFileSizeGB = maxFileSize / (1024 * 1024 * 1024);
    log.app.error('File too large:', {
      contentLength,
      maxFileSize,
      contentLengthGB: Math.round((contentLength / (1024 * 1024 * 1024)) * 100) / 100,
      maxFileSizeGB,
    });

    return {
      status: 413,
      type: 'payload-too-large',
      title: req.__('files.fileTooLarge', { size: maxFileSizeGB }),
    };
  }

  return null;
};

// Helper: Merge chunks into final file
const mergeChunks = async (tempDir, finalPath, totalChunks, contentLength) => {
  const chunks = readdirSync(tempDir).filter(f => f.startsWith('chunk-'));

  // Sort chunks by index
  const sortedChunks = chunks
    .map(f => ({ index: parseInt(f.split('-')[1]), path: join(tempDir, f) }))
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
    totalSize: sortedChunks.reduce((size, chunk) => size + statSync(chunk.path).size, 0),
  });

  // Ensure upload directory exists
  ensureDirSync(dirname(finalPath));

  // Create write stream for final file
  const writeStream = createWriteStream(finalPath, {
    flags: 'w',
    encoding: 'binary',
    mode: 0o600,
    autoClose: true,
  });

  // Stream one chunk into the shared write stream (never buffering a whole
  // chunk in memory), leaving the stream open for the next chunk. pipe()
  // handles backpressure; error listeners are detached once the chunk is done.
  const appendChunk = chunkPath =>
    new Promise((resolve, reject) => {
      const readStream = createReadStream(chunkPath);
      const onWriteError = err => {
        readStream.destroy();
        reject(err);
      };
      writeStream.once('error', onWriteError);
      readStream.once('error', err => {
        writeStream.removeListener('error', onWriteError);
        reject(err);
      });
      readStream.once('end', () => {
        writeStream.removeListener('error', onWriteError);
        resolve();
      });
      readStream.pipe(writeStream, { end: false });
    });

  // Helper function to merge chunks recursively (avoids await-in-loop)
  const mergeChunkRecursive = async (index, currentSize) => {
    if (index >= sortedChunks.length) {
      return currentSize;
    }

    const chunk = sortedChunks[index];
    const chunkSize = statSync(chunk.path).size;

    log.app.info(`Merging chunk ${index + 1}/${sortedChunks.length}:`, {
      chunkIndex: chunk.index,
      chunkPath: chunk.path,
      chunkSize,
      assembledSize: currentSize,
    });

    await appendChunk(chunk.path);

    await safeUnlink(chunk.path); // Delete chunk after merging

    return mergeChunkRecursive(index + 1, currentSize + chunkSize);
  };

  // Merge chunks sequentially using recursion
  const assembledSize = await mergeChunkRecursive(0, 0);

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

// Helper: Verify file checksum
const verifyChecksum = (filePath, expectedChecksum, checksumType) => {
  const nodeAlgo = expectedChecksum && checksumType ? checksumAlgorithm(checksumType) : null;
  if (!nodeAlgo) {
    return true;
  }

  log.app.info(`Verifying checksum (${nodeAlgo}) for file: ${filePath}`);

  return new Promise((resolve, reject) => {
    const hash = createHash(nodeAlgo);
    const stream = createReadStream(filePath);

    stream.on('error', err => reject(err));
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => {
      const calculated = hash.digest('hex');
      resolve(calculated === expectedChecksum.toLowerCase());
    });
  });
};

// Helper: Update database with file information
const updateDatabase = async (params, finalSize, headers) => {
  const { versionNumber, boxId, providerName, architectureName } = params;

  const version = await versions.findOne({
    where: { versionNumber },
    include: [
      {
        model: box,
        as: 'box',
        where: { name: boxId },
      },
    ],
  });

  if (!version) {
    throw new Error(`Version ${versionNumber} not found for box ${boxId}`);
  }

  const provider = await providers.findOne({
    where: {
      name: providerName,
      versionId: version.id,
    },
  });

  if (!provider) {
    throw new Error(`Provider ${providerName} not found`);
  }

  const architecture = await architectures.findOne({
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
    checksumType: (headers['x-checksum-type'] || 'NULL').toUpperCase().replace('-', ''),
    architectureId: architecture.id,
    fileSize: finalSize,
  };

  const fileRecord = await files.findOne({
    where: {
      fileName: 'vagrant.box',
      architectureId: architecture.id,
    },
  });

  if (fileRecord) {
    await fileRecord.update(fileData);
  } else {
    await files.create(fileData);
  }
};

// Helper: Handle chunked upload
const handleChunkedUpload = async (
  req,
  params,
  tempDir,
  finalPath,
  contentLength,
  startTime,
  maxFileSize
) => {
  const chunkIndex = parseInt(req.headers['x-chunk-index']);
  const totalChunks = parseInt(req.headers['x-total-chunks']);

  try {
    // Save chunk to temp file
    const chunkPath = join(tempDir, `chunk-${chunkIndex}`);
    const writeStream = createWriteStream(chunkPath, {
      flags: 'w',
      encoding: 'binary',
      mode: 0o600,
      autoClose: true,
    });

    // Handle connection close/abort
    req.on('close', () => {
      writeStream.end();
    });

    // Write chunk
    await new Promise((resolve, reject) => {
      req.pipe(writeStream).on('finish', resolve).on('error', reject);
    });

    // Check if all chunks received
    const chunks = readdirSync(tempDir).filter(f => f.startsWith('chunk-'));
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
      safeRmdirSync(tempDir);

      // Verify against max file size
      if (finalSize > maxFileSize) {
        await safeUnlink(finalPath);
        throw new Error(`File size cannot exceed ${maxFileSize / (1024 * 1024 * 1024)}GB`);
      }

      // Verify checksum if provided
      const checksum = req.headers['x-checksum'];
      const checksumType = req.headers['x-checksum-type'];
      if (checksum || checksumType) {
        let isValid;
        try {
          isValid = await verifyChecksum(finalPath, checksum, checksumType);
        } catch (error) {
          await safeUnlink(finalPath);
          throw error;
        }
        if (!isValid) {
          await safeUnlink(finalPath);
          throw new Error('Checksum verification failed');
        }
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

      const message =
        req.method === 'PUT' ? req.__('files.upload.updated') : req.__('files.upload.completed');

      return {
        isComplete: true,
        response: {
          message,
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
        message: req.__('files.upload.chunkCompleted'),
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
    // Clean up the upload's chunk directory on failure
    try {
      safeRmdirSync(tempDir);
    } catch (cleanupError) {
      log.error.error('Error cleaning up temp files:', cleanupError);
    }
    throw error;
  }
};

// Stale chunk-dir sweep: a crashed or abandoned chunked upload leaves its
// .temp directory behind forever. When a NEW chunked upload starts, sweep the
// box storage tree and remove .temp dirs untouched for a generous age — an
// in-flight upload keeps its dir fresh with every chunk it writes. The age is
// a YAML knob (app config: boxvault.upload_stale_temp_max_age_hours); this
// constant is only the load-failure fallback.
const STALE_TEMP_DIR_MAX_AGE_HOURS_FALLBACK = 24;

const sweepStaleTempDirs = () => {
  let appConfig;
  try {
    appConfig = loadConfig('app');
  } catch (e) {
    log.app.warn(`Stale temp sweep skipped, app config unavailable: ${e.message}`);
    return;
  }
  const storageRoot = appConfig.boxvault?.box_storage_directory;
  if (!storageRoot || !safeExistsSync(storageRoot)) {
    return;
  }

  const configuredMaxAgeHours = appConfig.boxvault?.upload_stale_temp_max_age_hours;
  const maxAgeHours =
    typeof configuredMaxAgeHours === 'number' && configuredMaxAgeHours > 0
      ? configuredMaxAgeHours
      : STALE_TEMP_DIR_MAX_AGE_HOURS_FALLBACK;
  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
  const walk = (dir, depth) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const fullPath = join(dir, entry.name);
      if (entry.name === '.temp') {
        try {
          if (statSync(fullPath).mtimeMs < cutoff) {
            log.app.info('Removing stale chunk temp directory:', { path: fullPath });
            safeRmdirSync(fullPath);
          }
        } catch (err) {
          log.app.warn(`Could not inspect temp directory ${fullPath}: ${err.message}`);
        }
      } else if (depth < 6) {
        // .temp lives at org/box/version/provider/arch/.temp — bounded walk
        walk(fullPath, depth + 1);
      }
    }
  };
  walk(storageRoot, 0);
};

// Helper: Handle single file upload
const handleSingleUpload = async (
  req,
  params,
  finalPath,
  contentLength,
  isChunked,
  startTime,
  maxFileSize
) => {
  // Resolve the checksum algorithm up front so we can hash the bytes as they
  // stream in (single pass) instead of re-reading the finished file.
  const expectedChecksum = req.headers['x-checksum'];
  const checksumType = req.headers['x-checksum-type'];
  const nodeAlgo = expectedChecksum && checksumType ? checksumAlgorithm(checksumType) : null;
  if (nodeAlgo) {
    log.app.info(`Verifying checksum (${nodeAlgo}) inline for file: ${finalPath}`);
  }
  const hash = nodeAlgo ? createHash(nodeAlgo) : null;

  // Single file upload: hash each chunk while it streams through to disk.
  const writeStream = createWriteStream(finalPath, {
    flags: 'w',
    encoding: 'binary',
    mode: 0o600,
    autoClose: true,
  });

  // Pass-through that taps the byte stream to update the running hash.
  const hasher = new Transform({
    transform(chunk, encoding, callback) {
      void encoding;
      if (hash) {
        hash.update(chunk);
      }
      callback(null, chunk);
    },
  });

  // pipeline() preserves backpressure and tears the streams down on abort/error.
  try {
    await pipeline(req, hasher, writeStream);
  } catch (error) {
    await safeUnlink(finalPath);
    throw error;
  }

  // Verify file size
  const finalSize = statSync(finalPath).size;

  // For non-chunked uploads, verify against Content-Length
  if (!isChunked && !isNaN(contentLength)) {
    const maxDiff = Math.max(1024 * 1024, contentLength * 0.01);
    if (Math.abs(finalSize - contentLength) > maxDiff) {
      await safeUnlink(finalPath);
      throw new Error(
        `File size mismatch: Expected ${contentLength} bytes but got ${finalSize} bytes`
      );
    }
  }

  // Verify against max file size
  if (finalSize > maxFileSize) {
    await safeUnlink(finalPath);
    throw new Error(`File size cannot exceed ${maxFileSize / (1024 * 1024 * 1024)}GB`);
  }

  // Verify checksum from the hash computed during the stream (no second read)
  if (hash) {
    const calculated = hash.digest('hex');
    if (calculated !== expectedChecksum.toLowerCase()) {
      await safeUnlink(finalPath);
      throw new Error('Checksum verification failed');
    }
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

  const message =
    req.method === 'PUT' ? req.__('files.upload.updated') : req.__('files.upload.completed');

  return {
    isComplete: true,
    response: {
      message,
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
  let finalPath;

  try {
    const maxFileSize = getMaxFileSize();
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
    const refusal = validateRequest(req, isChunked, contentLength, maxFileSize);
    if (refusal) {
      res.setHeader('Connection', 'close');
      return problem(res, req, refusal);
    }

    const refused = headerErrors(req.headers);
    if (refused.length > 0) {
      return problem(res, req, { status: 400, type: 'bad-request', errors: refused });
    }

    // Load config and prepare upload directory using secure path
    log.app.info('Loading config and preparing upload directory...');
    const uploadDir = getSecureBoxPath(
      organization,
      boxId,
      versionNumber,
      providerName,
      architectureName
    );

    log.app.info('Creating upload directory:', { uploadDir });
    ensureDirSync(uploadDir);
    finalPath = join(uploadDir, 'vagrant.box');

    // Get chunk information from headers
    const isMultipart =
      req.headers['x-chunk-index'] !== undefined || req.headers['x-total-chunks'] !== undefined;
    const chunkIndex = isMultipart ? Number(req.headers['x-chunk-index']) : NaN;
    const totalChunks = isMultipart ? Number(req.headers['x-total-chunks']) : NaN;

    log.app.info('Chunk analysis:', {
      chunkIndex,
      totalChunks,
      isMultipart,
    });

    // Create temp directory for chunks if needed
    const tempDir = join(uploadDir, '.temp');
    if (isMultipart) {
      // First chunk of a new upload: clear stale orphans left by dead uploads
      if (chunkIndex === 0) {
        sweepStaleTempDirs();
      }
      log.app.info('Creating temp directory for chunks:', { tempDir });
      ensureDirSync(tempDir);
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
        startTime,
        maxFileSize
      );
    } else {
      result = await handleSingleUpload(
        req,
        req.params,
        finalPath,
        contentLength,
        isChunked,
        startTime,
        maxFileSize
      );
    }

    return res.status(200).json(result.response);
  } catch (error) {
    log.error.error('Upload error:', error);

    // Clean up incomplete file if it exists
    if (finalPath && safeExistsSync(finalPath)) {
      if (error.message.includes('size mismatch') || error.message.includes('closed prematurely')) {
        try {
          await safeUnlink(finalPath);
          log.app.info('Cleaned up incomplete file:', finalPath);
        } catch (cleanupError) {
          log.error.error('Error cleaning up file:', cleanupError);
        }
      }
    }

    // Send error response if headers haven't been sent
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'UPLOAD_ERROR',
        message: req.__('files.upload.error'),
      });
    }
  }
  return undefined;
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

export const uploadFile = uploadMiddleware;
export const uploadSSLFile = uploadSSLMiddleware;
