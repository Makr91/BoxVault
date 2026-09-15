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

const refused = (res, req, form, values) => {
  const document = getRulesDocument();
  const errors = validateObject(document.forms[form], values, document);
  return errors.length > 0 ? refuse(res, req, errors) : null;
};

/**
 * @swagger
 * /api/organization/{organization}/download/{name}/release/{versionNumber}/patch/{patch}/file/{key}/upload:
 *   post:
 *     summary: Upload a download file
 *     description: Stream the bytes of one file of a patch, whole or in chunks (x-chunk-index, x-total-chunks, 5 MB chunks assembled on the last one, the info route polled meanwhile). The product, the release, the patch and the file row are created when absent, the caller holding what a create needs (any member of the organization creates a product; its owner, or an admin or owner of the organization, adds to it). The stored name is the real file name from x-file-name. An upload whose checksum matches an original of the organization becomes a symlink to it.
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
  const { organization: organizationName, name, versionNumber, patch: patchName, key } = req.params;
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

    const fileName = req.headers['x-file-name'] || key;
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
        isPublic: false,
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
