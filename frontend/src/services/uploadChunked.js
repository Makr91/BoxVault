import { log } from '../chrome';

const CHUNK_SIZE = 5 * 1024 * 1024;
const ASSEMBLY_TIMEOUT_MS = 120000;
const ASSEMBLY_FIRST_DELAY_MS = 1000;
const ASSEMBLY_MAX_DELAY_MS = 5000;

const wait = ms =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

const chunkHeaders = ({ file, checksum, checksumType, index, totalChunks }) => ({
  'X-File-Name': file.name,
  'X-Checksum': checksum || '',
  'X-Checksum-Type': checksumType || 'NULL',
  'X-Chunk-Index': String(index),
  'X-Total-Chunks': String(totalChunks),
});

const PROGRESS_OF = {
  uploading: (loaded, total) => Math.min(99, Math.round((loaded / total) * 100)),
  assembling: () => 99,
  complete: () => 100,
};

const reportProgress = (onUploadProgress, total, loaded, status, message = '') => {
  if (!onUploadProgress) {
    return;
  }
  onUploadProgress({
    loaded,
    total,
    progress: PROGRESS_OF[status](loaded, total),
    status,
    ...(message ? { message } : {}),
  });
};

const sendChunk = async (options, index, uploaded) => {
  const { client, path, file, checksum, checksumType, totalChunks, onUploadProgress } = options;
  const start = index * CHUNK_SIZE;
  const end = Math.min(start + CHUNK_SIZE, file.size);
  log.file.debug('Uploading chunk', {
    current: index + 1,
    total: totalChunks,
    start,
    end,
    size: end - start,
  });
  try {
    return await client.post(path, file.slice(start, end), {
      contentType: 'octet-stream',
      headers: chunkHeaders({ file, checksum, checksumType, index, totalChunks }),
      onUploadProgress: event =>
        reportProgress(onUploadProgress, file.size, uploaded + event.loaded, 'uploading'),
    });
  } catch (error) {
    if (error.serverMessage) {
      throw error;
    }
    throw new Error('errors.upload.chunkFailed');
  }
};

const sendFrom = async (options, index, uploaded) => {
  const { file, totalChunks, onUploadProgress } = options;
  const result = await sendChunk(options, index, uploaded);
  const end = Math.min((index + 1) * CHUNK_SIZE, file.size);
  if (result.details.isComplete) {
    reportProgress(onUploadProgress, file.size, file.size, 'complete');
    return result;
  }
  if (index === totalChunks - 1) {
    reportProgress(onUploadProgress, file.size, end, 'assembling');
    return null;
  }
  reportProgress(onUploadProgress, file.size, end, 'uploading');
  return sendFrom(options, index + 1, end);
};

const pollAssembly = async ({ info, fileSize, onUploadProgress, startedAt, delay, attempt }) => {
  if (Date.now() - startedAt >= ASSEMBLY_TIMEOUT_MS) {
    throw new Error('errors.upload.assemblyTimeout');
  }
  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  log.file.debug('Assembly check attempt', {
    attempt,
    elapsed: `${elapsed}s`,
    delay: `${delay}ms`,
  });
  const assembledSize = await info()
    .then(data => data?.fileSize)
    .catch(error => {
      log.file.warn('Assembly check failed', { error: error.message });
      return undefined;
    });
  if (typeof assembledSize === 'number') {
    const difference = Math.abs(fileSize - assembledSize);
    const maxDifference = Math.max(1024 * 1024, fileSize * 0.01);
    if (difference > maxDifference) {
      log.file.error('Size mismatch after assembly', {
        originalSize: fileSize,
        assembledSize,
        difference,
        maxAllowedDiff: maxDifference,
      });
      throw new Error('errors.upload.sizeMismatch');
    }
    log.file.info('Assembly completed successfully', {
      finalSize: assembledSize,
      originalSize: fileSize,
      duration: `${elapsed}s`,
    });
    reportProgress(onUploadProgress, fileSize, fileSize, 'complete', 'Upload complete');
    return {
      message: 'File upload completed',
      details: { isComplete: true, status: 'complete', fileSize: assembledSize },
    };
  }
  const nextDelay = Math.min(delay * 1.5, ASSEMBLY_MAX_DELAY_MS);
  await wait(nextDelay);
  reportProgress(
    onUploadProgress,
    fileSize,
    fileSize,
    'assembling',
    `Assembling file chunks (${Math.round((Date.now() - startedAt) / 1000)}s)...`
  );
  return pollAssembly({
    info,
    fileSize,
    onUploadProgress,
    startedAt,
    delay: nextDelay,
    attempt: attempt + 1,
  });
};

/**
 * Upload one box file in 5 MB chunks through the API client, sequentially,
 * then wait for the backend to assemble them. Progress events carry
 * `{ loaded, total, progress, status: 'uploading' | 'assembling' | 'complete', message? }`,
 * with in-chunk progress from the transfer itself.
 *
 * @param {Object} options - The upload
 * @param {Object} options.client - The API client
 * @param {string} options.path - The chunk upload path
 * @param {File} options.file - The file to send
 * @param {string} [options.checksum] - The declared checksum
 * @param {string} [options.checksumType] - The checksum algorithm, `NULL` when none
 * @param {() => Promise<Object>} options.info - Reads the assembled file's info
 * @param {Function} [options.onUploadProgress] - Progress callback
 * @returns {Promise<Object>} The backend's completion result
 */
export const uploadChunked = async ({
  client,
  path,
  file,
  checksum,
  checksumType,
  info,
  onUploadProgress,
}) => {
  if (!file) {
    throw new Error('errors.upload.noFile');
  }
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  log.file.info('Starting chunked upload', {
    fileName: file.name,
    fileSize: file.size,
    chunkSize: CHUNK_SIZE,
    estimatedChunks: totalChunks,
    checksum: checksum || 'none',
    checksumType: checksumType || 'NULL',
  });
  try {
    const options = { client, path, file, checksum, checksumType, totalChunks, onUploadProgress };
    const result = totalChunks > 0 ? await sendFrom(options, 0, 0) : null;
    if (result) {
      log.file.info('Upload completed successfully', { result });
      return result;
    }
    log.file.info('All chunks uploaded, starting assembly phase');
    reportProgress(
      onUploadProgress,
      file.size,
      file.size,
      'assembling',
      'Assembling file chunks...'
    );
    return await pollAssembly({
      info,
      fileSize: file.size,
      onUploadProgress,
      startedAt: Date.now(),
      delay: ASSEMBLY_FIRST_DELAY_MS,
      attempt: 1,
    });
  } catch (error) {
    log.file.error('Upload failed', {
      error: error.message,
      stack: error.stack,
      fileName: file.name,
      fileSize: file.size,
      type: file.type,
      lastModified: new Date(file.lastModified).toISOString(),
    });
    throw error;
  }
};
