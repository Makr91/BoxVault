import { readdirSync, statSync, createWriteStream, createReadStream, symlinkSync } from 'fs';
import { createHash } from 'crypto';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { join, dirname } from 'path';
import { loadConfig } from '../utils/config-loader.js';
import { log } from '../utils/Logger.js';
import { problem } from '../utils/problem.js';
import { safeUnlink, safeRmdirSync, ensureDirSync, safeExistsSync } from '../utils/fsHelper.js';
import {
  absolutePath,
  findOriginalByChecksum,
  getSecureDownloadPath,
  storagePathFor,
} from '../controllers/download/helpers.js';

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
      rule: 'maximum',
      params: { maximum: total - 1 },
    });
  }
  return errors;
};

const getMaxFileSize = () => {
  try {
    const appConfig = loadConfig('app');
    return appConfig.boxvault.box_max_file_size * 1024 * 1024 * 1024;
  } catch (e) {
    log.error.error(`Failed to load app configuration: ${e.message}`);
    return 10 * 1024 * 1024 * 1024;
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

const mergeChunks = async (tempDir, finalPath, totalChunks, contentLength) => {
  const chunks = readdirSync(tempDir).filter(f => f.startsWith('chunk-'));

  const sortedChunks = chunks
    .map(f => ({ index: parseInt(f.split('-')[1]), path: join(tempDir, f) }))
    .sort((a, b) => a.index - b.index);

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

  ensureDirSync(dirname(finalPath));

  const writeStream = createWriteStream(finalPath, {
    flags: 'w',
    encoding: 'binary',
    mode: 0o600,
    autoClose: true,
  });

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

    await safeUnlink(chunk.path);

    return mergeChunkRecursive(index + 1, currentSize + chunkSize);
  };

  const assembledSize = await mergeChunkRecursive(0, 0);

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

const digestFile = (filePath, algorithm) =>
  new Promise((resolve, reject) => {
    const hash = createHash(algorithm);
    const stream = createReadStream(filePath);

    stream.on('error', err => reject(err));
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });

const verifyChecksum = async (filePath, expectedChecksum, checksumType) => {
  const nodeAlgo = expectedChecksum && checksumType ? checksumAlgorithm(checksumType) : null;
  if (!nodeAlgo) {
    return true;
  }

  log.app.info(`Verifying checksum (${nodeAlgo}) for file: ${filePath}`);

  const calculated = await digestFile(filePath, nodeAlgo);
  return calculated === expectedChecksum.toLowerCase();
};

/**
 * Whether the assembled bytes already exist as an original of the
 * organization: the new path becomes a symlink to that original and the
 * row a link; otherwise the row owns its bytes.
 * @param {Object} entities - The organization and file rows
 * @param {string} checksum - The checksum of the assembled file
 * @param {string} finalPath - The assembled file
 * @returns {Promise<{original: boolean, linksTo: number|null}>} The ownership of the row
 */
const dedupe = async (entities, checksum, finalPath) => {
  const original = await findOriginalByChecksum(
    entities.organization.id,
    checksum,
    entities.file.id
  );
  if (!original || !original.storagePath) {
    return { original: true, linksTo: null };
  }
  const originalPath = absolutePath(original.storagePath);
  if (!safeExistsSync(originalPath) || originalPath === finalPath) {
    return { original: true, linksTo: null };
  }
  await safeUnlink(finalPath);
  symlinkSync(originalPath, finalPath);
  log.file.info(`Download Dedupe: ${finalPath} links to ${originalPath}.`);
  return { original: false, linksTo: original.id };
};

const updateDatabase = async (entities, finalSize, headers, finalPath) => {
  const { organization, download, release, patch, file } = entities;
  const declared = headers['x-checksum'] || null;
  const declaredType = (headers['x-checksum-type'] || 'NULL').toUpperCase().replace('-', '');
  const checksum = declared ? declared.toLowerCase() : await digestFile(finalPath, 'sha256');
  const checksumType = declared ? declaredType : 'SHA256';
  const ownership = await dedupe(entities, checksum, finalPath);

  await file.update({
    fileSize: finalSize,
    checksum,
    checksumType,
    storagePath: storagePathFor(
      organization.name,
      download.name,
      release.versionNumber,
      patch.name,
      file.fileName
    ),
    ...ownership,
  });
};

const handleChunkedUpload = async (
  req,
  entities,
  tempDir,
  finalPath,
  contentLength,
  startTime,
  maxFileSize
) => {
  const chunkIndex = parseInt(req.headers['x-chunk-index']);
  const totalChunks = parseInt(req.headers['x-total-chunks']);

  try {
    const chunkPath = join(tempDir, `chunk-${chunkIndex}`);
    const writeStream = createWriteStream(chunkPath, {
      flags: 'w',
      encoding: 'binary',
      mode: 0o600,
      autoClose: true,
    });

    req.on('close', () => {
      writeStream.end();
    });

    await new Promise((resolve, reject) => {
      req.pipe(writeStream).on('finish', resolve).on('error', reject);
    });

    const chunks = readdirSync(tempDir).filter(f => f.startsWith('chunk-'));
    log.app.info('Chunk upload status:', {
      received: chunks.length,
      total: totalChunks,
      current: chunkIndex,
    });

    if (chunks.length === totalChunks) {
      const finalSize = await mergeChunks(tempDir, finalPath, totalChunks, contentLength);

      log.app.info('Cleaning up temp directory:', tempDir);
      safeRmdirSync(tempDir);

      if (finalSize > maxFileSize) {
        await safeUnlink(finalPath);
        throw new Error(`File size cannot exceed ${maxFileSize / (1024 * 1024 * 1024)}GB`);
      }

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

      await updateDatabase(entities, finalSize, req.headers, finalPath);

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
          message: req.__('files.upload.completed'),
          details: {
            isComplete: true,
            status: 'complete',
            fileSize: finalSize,
          },
        },
      };
    }

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
    try {
      safeRmdirSync(tempDir);
    } catch (cleanupError) {
      log.error.error('Error cleaning up temp files:', cleanupError);
    }
    throw error;
  }
};

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
        walk(fullPath, depth + 1);
      }
    }
  };
  walk(storageRoot, 0);
};

const handleSingleUpload = async (
  req,
  entities,
  finalPath,
  contentLength,
  isChunked,
  startTime,
  maxFileSize
) => {
  const expectedChecksum = req.headers['x-checksum'];
  const checksumType = req.headers['x-checksum-type'];
  const nodeAlgo = expectedChecksum && checksumType ? checksumAlgorithm(checksumType) : null;
  if (nodeAlgo) {
    log.app.info(`Verifying checksum (${nodeAlgo}) inline for file: ${finalPath}`);
  }
  const hash = nodeAlgo ? createHash(nodeAlgo) : null;

  const writeStream = createWriteStream(finalPath, {
    flags: 'w',
    encoding: 'binary',
    mode: 0o600,
    autoClose: true,
  });

  const hasher = new Transform({
    transform(chunk, encoding, callback) {
      void encoding;
      if (hash) {
        hash.update(chunk);
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(req, hasher, writeStream);
  } catch (error) {
    await safeUnlink(finalPath);
    throw error;
  }

  const finalSize = statSync(finalPath).size;

  if (!isChunked && !isNaN(contentLength)) {
    const maxDiff = Math.max(1024 * 1024, contentLength * 0.01);
    if (Math.abs(finalSize - contentLength) > maxDiff) {
      await safeUnlink(finalPath);
      throw new Error(
        `File size mismatch: Expected ${contentLength} bytes but got ${finalSize} bytes`
      );
    }
  }

  if (finalSize > maxFileSize) {
    await safeUnlink(finalPath);
    throw new Error(`File size cannot exceed ${maxFileSize / (1024 * 1024 * 1024)}GB`);
  }

  if (hash) {
    const calculated = hash.digest('hex');
    if (calculated !== expectedChecksum.toLowerCase()) {
      await safeUnlink(finalPath);
      throw new Error('Checksum verification failed');
    }
  }

  await updateDatabase(entities, finalSize, req.headers, finalPath);

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
      message: req.__('files.upload.completed'),
      details: {
        isComplete: true,
        status: 'complete',
        fileSize: finalSize,
      },
    },
  };
};

/**
 * Stream a download file to its product path, whole or in chunks: the same
 * shape as the box upload middleware, the file stored under the real file
 * name of its row and deduplicated by checksum against the organization's
 * originals. Answers the request itself.
 * @param {import('express').Request} req - The request, req.entities carrying organization, download, release, patch and file
 * @param {import('express').Response} res - The response
 * @returns {Promise<void>}
 */
const uploadDownloadMiddleware = async (req, res) => {
  log.app.info('=== DOWNLOAD UPLOAD MIDDLEWARE ENTRY ===', {
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

  req.setTimeout(0);
  res.setTimeout(0);

  req._body = true;

  const startTime = Date.now();
  let finalPath;

  try {
    const maxFileSize = getMaxFileSize();
    const { entities } = req;
    const { organization, download, release, patch, file } = entities;

    log.app.info('Download upload middleware processing request for:', {
      organization: organization.name,
      download: download.name,
      release: release.versionNumber,
      patch: patch.name,
      file: file.fileName,
    });

    const isChunked = req.headers['transfer-encoding'] === 'chunked';
    const contentLength = parseInt(req.headers['content-length']);

    const refusal = validateRequest(req, isChunked, contentLength, maxFileSize);
    if (refusal) {
      res.setHeader('Connection', 'close');
      return problem(res, req, refusal);
    }

    const refused = headerErrors(req.headers);
    if (refused.length > 0) {
      return problem(res, req, { status: 400, type: 'bad-request', errors: refused });
    }

    const uploadDir = getSecureDownloadPath(
      organization.name,
      download.name,
      release.versionNumber,
      patch.name
    );

    log.app.info('Creating upload directory:', { uploadDir });
    ensureDirSync(uploadDir);
    finalPath = join(uploadDir, file.fileName);

    const isMultipart =
      req.headers['x-chunk-index'] !== undefined || req.headers['x-total-chunks'] !== undefined;
    const chunkIndex = isMultipart ? Number(req.headers['x-chunk-index']) : NaN;
    const totalChunks = isMultipart ? Number(req.headers['x-total-chunks']) : NaN;

    const tempDir = join(uploadDir, '.temp', file.fileName);
    if (isMultipart) {
      if (chunkIndex === 0) {
        sweepStaleTempDirs();
      }
      log.app.info('Creating temp directory for chunks:', { tempDir });
      ensureDirSync(tempDir);
    }

    log.app.info('=== STARTING DOWNLOAD FILE UPLOAD PROCESS ===', {
      fileName: file.fileName,
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
        entities,
        tempDir,
        finalPath,
        contentLength,
        startTime,
        maxFileSize
      );
    } else {
      result = await handleSingleUpload(
        req,
        entities,
        finalPath,
        contentLength,
        isChunked,
        startTime,
        maxFileSize
      );
    }

    return res.status(200).json(result.response);
  } catch (error) {
    log.error.error('Download upload error:', error);

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

    if (!res.headersSent) {
      return problem(res, req, {
        status: 500,
        type: 'internal',
        title: req.__('files.upload.error'),
      });
    }
  }
  return undefined;
};

export const uploadDownloadFile = uploadDownloadMiddleware;
