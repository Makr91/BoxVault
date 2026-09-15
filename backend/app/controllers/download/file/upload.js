import fs from 'fs';
import db from '../../../models/index.js';
import { loadConfig } from '../../../utils/config-loader.js';
import { log } from '../../../utils/Logger.js';
import { canWriteDownload, resolveOrgMembership } from '../../../utils/orgMembership.js';
import { problem, refuse } from '../../../utils/problem.js';
import { getRulesDocument } from '../../../utils/rules.js';
import { validateObject } from '../../../utils/validation.js';
import { uploadDownloadFile } from '../../../middleware/uploadDownload.js';
import { absolutePath, promoteOriginal } from '../helpers.js';

const {
  organization: Organization,
  download: Download,
  downloadReleases: DownloadRelease,
  downloadPatches: DownloadPatch,
  downloadFiles: DownloadFile,
  Sequelize,
} = db;
const { Op } = Sequelize;

const FILENAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const FILENAME_MAX_LENGTH = 255;
const EXTENSION_PATTERN = /(?:\.[A-Za-z][A-Za-z0-9]*)+$/;
const TOKEN_SEPARATOR = /[_\- ]+/;
const VERSION_PATTERN = /^\d+(?:\.\d+)*$/;

const refused = (res, req, form, values) => {
  const document = getRulesDocument();
  const errors = validateObject(document.forms[form], values, document);
  return errors.length > 0 ? refuse(res, req, errors) : null;
};

/**
 * The product slug and the release identifier a file name carries: the
 * extension chain stripped, the stem split on underscore, dash and space, the
 * first token shaped digits(.digits)* the release, the tokens before it the
 * product, lower-cased and joined by dashes (every token when no version
 * token exists). A missing value is left empty for the form that validates
 * it to refuse.
 * @param {string} fileName - The real file name
 * @returns {{ name: string, versionNumber: string }} The guessed levels
 */
const levelsFromFileName = fileName => {
  const tokens = fileName.replace(EXTENSION_PATTERN, '').split(TOKEN_SEPARATOR).filter(Boolean);
  const at = tokens.findIndex(token => VERSION_PATTERN.test(token));
  return {
    name: tokens
      .slice(0, at >= 0 ? at : tokens.length)
      .join('-')
      .toLowerCase(),
    versionNumber: at >= 0 ? tokens[at] : '',
  };
};

/**
 * The four levels of the upload: what the path names, else what the file
 * name names (product and release), the patch `release` and the key the
 * file name.
 * @param {Object} params - The route parameters
 * @param {string} fileName - The real file name
 * @returns {{ name: string, versionNumber: string, patchName: string, key: string }} The levels
 */
const levelsOf = (params, fileName) => {
  const guessed = levelsFromFileName(fileName);
  return {
    name: params.name ?? guessed.name,
    versionNumber: params.versionNumber ?? guessed.versionNumber,
    patchName: params.patch ?? 'release',
    key: params.key ?? fileName,
  };
};

/**
 * @swagger
 * /api/organization/{organization}/download/file/upload:
 *   post:
 *     summary: Upload a download file into the organization
 *     description: The same upload as the full path, the product slug and the release identifier read from x-file-name (Domino_14.5.1_Linux_English.tar names product domino and release 14.5.1), the patch `release` and the key the file name; every absent level is created. `?is_public=true` makes a product the upload creates public.
 *     tags: [Downloads]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: is_public
 *         schema:
 *           type: boolean
 *       - in: header
 *         name: x-file-name
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/octet-stream:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       200:
 *         description: The chunk was stored, or the file was assembled and its row updated
 *       400:
 *         description: No file name, or one that is not allowed
 *       403:
 *         description: The caller is not a member
 *       422:
 *         description: The file name yields no slug or no identifier
 * /api/organization/{organization}/download/{name}/file/upload:
 *   post:
 *     summary: Upload a download file into a product
 *     description: The release identifier read from x-file-name, the patch `release`, the key the file name.
 *     tags: [Downloads]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: is_public
 *         schema:
 *           type: boolean
 *       - in: header
 *         name: x-file-name
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/octet-stream:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       200:
 *         description: The chunk was stored, or the file was assembled and its row updated
 * /api/organization/{organization}/download/{name}/release/{versionNumber}/file/upload:
 *   post:
 *     summary: Upload a download file into a release
 *     description: The patch `release`, the key the file name.
 *     tags: [Downloads]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: x-file-name
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/octet-stream:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       200:
 *         description: The chunk was stored, or the file was assembled and its row updated
 * /api/organization/{organization}/download/{name}/release/{versionNumber}/patch/{patch}/file/upload:
 *   post:
 *     summary: Upload a download file into a patch
 *     description: The key the file name.
 *     tags: [Downloads]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: patch
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: x-file-name
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/octet-stream:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       200:
 *         description: The chunk was stored, or the file was assembled and its row updated
 * /api/organization/{organization}/download/{name}/release/{versionNumber}/patch/{patch}/file/{key}/upload:
 *   post:
 *     summary: Upload a download file
 *     description: Stream the bytes of one file of a patch, whole or in chunks (x-chunk-index, x-total-chunks, 5 MB chunks assembled on the last one, the info route polled meanwhile). The product, the release, the patch and the file row are created when absent, the caller holding what a create needs (any member of the organization creates a product; its owner, or an admin or owner of the organization, adds to it). The stored name is the real file name from x-file-name. An upload whose checksum matches an original of the organization becomes a symlink to it. `?is_public=true` makes a product the upload creates public.
 *     tags: [Downloads]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Product name (the slug pattern of /api/rules)
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Release identifier (the identifier pattern of /api/rules)
 *       - in: path
 *         name: patch
 *         required: true
 *         schema:
 *           type: string
 *         description: Patch name (release for the release itself)
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: File key, or the file name of an existing row
 *       - in: header
 *         name: x-file-name
 *         schema:
 *           type: string
 *         description: The real file name (letters, digits, dot, dash and underscore); the key when absent
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
 *         description: The chunk was stored, or the file was assembled and its row updated
 *       400:
 *         description: An upload header breaks its rule, or the file name is not allowed
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       403:
 *         description: The caller may not write the product
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: Organization not found
 *       413:
 *         description: File too large
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A product name that is not a slug, or a release, patch or key that is not an identifier
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 */
const upload = (req, res) => {
  const { organization: organizationName } = req.params;
  const fileName = req.headers['x-file-name'] || req.params.key || '';
  const { name, versionNumber, patchName, key } = levelsOf(req.params, fileName);
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
    if (!membership) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('downloads.permissionDenied'),
      });
    }

    if (
      !FILENAME_PATTERN.test(fileName) ||
      fileName.includes('..') ||
      fileName.length > FILENAME_MAX_LENGTH
    ) {
      return problem(res, req, {
        status: 400,
        type: 'bad-request',
        title: req.__('files.invalidFileName'),
      });
    }

    let download = await Download.findOne({ where: { name, organizationId: organization.id } });
    if (download) {
      if (!canWriteDownload(req, download, membership)) {
        return problem(res, req, {
          status: 403,
          type: 'forbidden',
          title: req.__('downloads.permissionDenied'),
        });
      }
    } else {
      const refusal = refused(res, req, 'download', { name });
      if (refusal) {
        return refusal;
      }
      download = await Download.create({
        name,
        published: false,
        isPublic: req.query.is_public === 'true',
        userId: req.userId,
        organizationId: organization.id,
      });
    }

    let release = await DownloadRelease.findOne({
      where: { versionNumber, downloadId: download.id },
    });
    if (!release) {
      const refusal = refused(res, req, 'release', { version_number: versionNumber });
      if (refusal) {
        return refusal;
      }
      release = await DownloadRelease.create({ versionNumber, downloadId: download.id });
    }

    let patch = await DownloadPatch.findOne({
      where: { name: patchName, downloadReleaseId: release.id },
    });
    if (!patch) {
      const refusal = refused(res, req, 'patch', { name: patchName });
      if (refusal) {
        return refusal;
      }
      patch = await DownloadPatch.create({ name: patchName, downloadReleaseId: release.id });
    }

    let file = await DownloadFile.findOne({
      where: { downloadPatchId: patch.id, [Op.or]: [{ key }, { fileName: key }] },
    });
    if (file) {
      if (file.storagePath) {
        if (file.original) {
          await promoteOriginal(file);
        }
        const existingPath = absolutePath(file.storagePath);
        const stat = fs.lstatSync(existingPath, { throwIfNoEntry: false });
        if (stat && stat.isSymbolicLink()) {
          fs.unlinkSync(existingPath);
        }
      }
      if (req.headers['x-file-name'] && file.fileName !== fileName) {
        file = await file.update({ fileName });
      }
    } else {
      const refusal = refused(res, req, 'downloadFile', { key });
      if (refusal) {
        return refusal;
      }
      file = await DownloadFile.create({
        key,
        fileName,
        kind: 'other',
        platform: 'any',
        architecture: 'any',
        language: 'any',
        fileSize: 0,
        original: true,
        downloadPatchId: patch.id,
      });
    }

    req.entities = { organization, download, release, patch, file };

    log.app.info('Download entities resolved, calling upload middleware...', {
      download: download.name,
      release: release.versionNumber,
      patch: patch.name,
      file: file.fileName,
    });

    await uploadDownloadFile(req, res);
    return undefined;
  })().catch(err => {
    log.error.error('Download file upload error:', {
      error: err.message,
      code: err.code,
      stack: err.stack,
      params: {
        organization: organizationName,
        name,
        versionNumber,
        patch: patchName,
        key,
      },
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
