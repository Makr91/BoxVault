/**
 * @swagger
 * components:
 *   schemas:
 *     PendingUploadGuess:
 *       type: object
 *       description: The words the file name gave, never a rule; empty where the name gives nothing
 *       properties:
 *         product:
 *           type: string
 *         release:
 *           type: string
 *         patch:
 *           type: string
 *         key:
 *           type: string
 *         kind:
 *           type: string
 *         platform:
 *           type: string
 *         architecture:
 *           type: string
 *         language:
 *           type: string
 *     PendingUpload:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: The opaque id of the pending upload
 *         file_name:
 *           type: string
 *         size:
 *           type: integer
 *           description: The assembled size, 0 until the bytes are assembled
 *         guess:
 *           $ref: '#/components/schemas/PendingUploadGuess'
 */

import { randomBytes } from 'crypto';
import db from '../../../models/index.js';
import { loadConfig } from '../../../utils/config-loader.js';
import { log } from '../../../utils/Logger.js';
import { canWriteInOrg, resolveOrgMembership } from '../../../utils/orgMembership.js';
import { problem } from '../../../utils/problem.js';
import { safeRmdirSync } from '../../../utils/fsHelper.js';
import { uploadPendingFile } from '../../../middleware/uploadDownload.js';
import { getPendingPath, pendingStoragePathFor } from '../helpers.js';
import { isAllowedFileName } from '../file/upload.js';
import { guessFromFileName } from './guess.js';

const { organization: Organization, downloadPendingUploads: PendingUpload } = db;

const chunkIndexOf = headers => {
  const raw = headers['x-chunk-index'];
  return raw === undefined ? null : Number(raw);
};

/**
 * The unassembled pending upload of this uploader and file name in the
 * organization, the row a later chunk continues; null when none.
 * @param {number} organizationId - Organization id
 * @param {number} userId - The uploader
 * @param {string} fileName - The real file name
 * @returns {Promise<Object|null>} The row, or null
 */
const inFlight = (organizationId, userId, fileName) =>
  PendingUpload.findOne({
    where: { organizationId, userId, fileName, checksum: null },
    order: [['createdAt', 'DESC']],
  });

/**
 * A new pending upload row for the file name, its guess read from the name.
 * @param {Object} organization - The organization row
 * @param {number} userId - The uploader
 * @param {string} fileName - The real file name
 * @returns {Promise<Object>} The row
 */
const startPending = (organization, userId, fileName) => {
  const id = randomBytes(16).toString('hex');
  const guess = guessFromFileName(fileName);
  return PendingUpload.create({
    id,
    fileName,
    storagePath: pendingStoragePathFor(organization.name, id, fileName),
    guessProduct: guess.product,
    guessRelease: guess.release,
    guessPatch: guess.patch,
    guessKey: guess.key,
    guessKind: guess.kind,
    guessPlatform: guess.platform,
    guessArchitecture: guess.architecture,
    guessLanguage: guess.language,
    userId,
    organizationId: organization.id,
  });
};

/**
 * The pending upload row a request works on: a chunk after the first
 * continues the unassembled row of the same uploader and file name; chunk 0,
 * or a whole-file upload, starts a new row and drops an unassembled one of
 * the same name with its directory.
 * @param {Object} organization - The organization row
 * @param {number} userId - The uploader
 * @param {string} fileName - The real file name
 * @param {number|null} chunkIndex - The x-chunk-index, null for a whole-file upload
 * @returns {Promise<Object>} The row
 */
const pendingFor = async (organization, userId, fileName, chunkIndex) => {
  const current = await inFlight(organization.id, userId, fileName);
  if (current && chunkIndex !== null && chunkIndex > 0) {
    return current;
  }
  if (current) {
    safeRmdirSync(getPendingPath(organization.name, current.id));
    await current.destroy();
  }
  return startPending(organization, userId, fileName);
};

/**
 * @swagger
 * /api/organization/{organization}/download/pending/upload:
 *   post:
 *     summary: Upload a download file into the organization's pending store
 *     description: The first step of a person's upload. The same chunked upload as the level routes (x-chunk-index, x-total-chunks, x-file-name, x-checksum, x-checksum-type) into the organization's pending store, validating nothing but the upload headers and the file name. The chunks of one upload are keyed by the organization, the uploader and the file name, as the sender carries nothing else across them; chunk 0 starts a new pending upload and replaces an unassembled one of the same name, a later chunk continues it. Every chunk answers `details.isComplete` and `details.status` as the box upload does, beside `{ id, file_name, size, guess }`, the guess read from the file name (product, release, patch, key, kind, platform, architecture, language; empty where the name gives nothing). The pending upload is placed by `POST …/pending/{id}/place`, discarded by `DELETE …/pending/{id}`, and dropped by the server after a day. Any member may upload; a guest may not.
 *     tags: [Downloads]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: x-file-name
 *         required: true
 *         schema:
 *           type: string
 *         description: The real file name (letters, digits, dot, dash and underscore)
 *       - in: header
 *         name: x-checksum
 *         schema:
 *           type: string
 *       - in: header
 *         name: x-checksum-type
 *         schema:
 *           type: string
 *           enum: [NULL, MD5, SHA1, SHA256, SHA384, SHA512]
 *       - in: header
 *         name: x-chunk-index
 *         schema:
 *           type: integer
 *       - in: header
 *         name: x-total-chunks
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/octet-stream:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       200:
 *         description: The chunk was stored, or the file was assembled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 details:
 *                   allOf:
 *                     - $ref: '#/components/schemas/PendingUpload'
 *                     - type: object
 *                       properties:
 *                         isComplete:
 *                           type: boolean
 *                         status:
 *                           type: string
 *                           enum: [uploading, complete]
 *                         fileSize:
 *                           type: integer
 *       400:
 *         description: An upload header breaks its rule, or the file name is missing or not allowed
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       403:
 *         description: The caller is not a writing member of the organization
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: Organization not found
 *       413:
 *         description: File too large
 *       500:
 *         description: Internal server error
 */
const upload = (req, res) => {
  const { organization: organizationName } = req.params;
  const fileName = req.headers['x-file-name'] || '';
  const uploadStartTime = Date.now();

  const appConfig = loadConfig('app');
  const uploadTimeoutHours = appConfig.boxvault?.upload_timeout_hours || 24;
  const uploadTimeoutMs = uploadTimeoutHours * 60 * 60 * 1000;
  req.setTimeout(uploadTimeoutMs);
  res.setTimeout(uploadTimeoutMs);

  return (async () => {
    const organization = await Organization.findOne({ where: { name: organizationName } });
    if (!organization) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('organizations.organizationNotFoundWithName', {
          organization: organizationName,
        }),
      });
    }

    const membership = await resolveOrgMembership(req, organization.id);
    if (!canWriteInOrg(membership)) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('downloads.permissionDenied'),
      });
    }

    if (!isAllowedFileName(fileName)) {
      return problem(res, req, {
        status: 400,
        type: 'bad-request',
        title: req.__('files.invalidFileName'),
      });
    }

    const pending = await pendingFor(organization, req.userId, fileName, chunkIndexOf(req.headers));

    req.pending = { organization, pending };

    log.app.info('Pending upload row resolved, calling upload middleware...', {
      organization: organization.name,
      id: pending.id,
      file: fileName,
    });

    await uploadPendingFile(req, res);
    return undefined;
  })().catch(err => {
    log.error.error('Pending upload error:', {
      error: err.message,
      code: err.code,
      stack: err.stack,
      params: { organization: organizationName, fileName },
    });

    log.app.info('Upload failed after', { seconds: (Date.now() - uploadStartTime) / 1000 });

    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('files.upload.error'),
    });
  });
};

export { upload };
