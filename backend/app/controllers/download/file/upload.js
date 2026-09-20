import fs from 'fs';
import db from '../../../models/index.js';
import { loadConfig } from '../../../utils/config-loader.js';
import { log } from '../../../utils/Logger.js';
import {
  canWriteDownload,
  canWriteInOrg,
  resolveOrgMembership,
  visibilityOfQuery,
  widerThanParent,
} from '../../../utils/orgMembership.js';
import { conflict, problem, refuse } from '../../../utils/problem.js';
import { getRulesDocument } from '../../../utils/rules.js';
import { validateObject } from '../../../utils/validation.js';
import { uploadDownloadFile } from '../../../middleware/uploadDownload.js';
import { absolutePath, isReservedProductName, promoteOriginal } from '../helpers.js';

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
const FILE_MEMBERS = ['kind', 'platform', 'architecture', 'language', 'variant'];
const FILE_DEFAULTS = { kind: 'other', platform: 'any', architecture: 'any', language: 'any' };

const membersOf = query =>
  Object.fromEntries(
    FILE_MEMBERS.map(member => [member, query[member]]).filter(
      ([, value]) => typeof value === 'string' && value !== ''
    )
  );
const EXTENSION_PATTERN = /(?:\.[A-Za-z][A-Za-z0-9]*)+$/;
const TOKEN_SEPARATOR = /[_\- ]+/;
const VERSION_PATTERN = /^\d+(?:\.\d+)*$/;

/**
 * Refuse the write when the values break the named form of the rules
 * document, 422 with pointers (409 when every failing rule is unique).
 * @param {import('express').Response} res - The response
 * @param {import('express').Request} req - The request (i18n)
 * @param {string} form - A key of the rules document's forms
 * @param {Object} values - The values to evaluate
 * @returns {import('express').Response|null} The refusal, or null when the values pass
 */
const refused = (res, req, form, values) => {
  const document = getRulesDocument();
  const errors = validateObject(document.forms[form], values, document);
  return errors.length > 0 ? refuse(res, req, errors) : null;
};

/**
 * Whether a file name may be stored: letters, digits, dot, dash and
 * underscore, no `..`, at most 255 characters.
 * @param {string} fileName - The real file name
 * @returns {boolean} True when the name is allowed
 */
const isAllowedFileName = fileName =>
  FILENAME_PATTERN.test(fileName) &&
  !fileName.includes('..') &&
  fileName.length <= FILENAME_MAX_LENGTH;

/**
 * The extension chain of a file name, lower-cased (`.tar.gz`), empty when none.
 * @param {string} fileName - The real file name
 * @returns {string} The extension chain
 */
const extensionOf = fileName => (fileName.match(EXTENSION_PATTERN) || [''])[0].toLowerCase();

/**
 * The tokens of a file name's stem: the extension chain stripped, the stem
 * split on underscore, dash and space.
 * @param {string} fileName - The real file name
 * @returns {Array<string>} The tokens
 */
const tokensOf = fileName =>
  fileName.replace(EXTENSION_PATTERN, '').split(TOKEN_SEPARATOR).filter(Boolean);

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
  const tokens = tokensOf(fileName);
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
 *     description: The same upload as the full path, the product slug and the release identifier read from x-file-name (Domino_14.5.1_Linux_English.tar names product domino and release 14.5.1), the patch `release` and the key the file name; every absent level is created. Every row the upload creates, product, release, patch and file, is born private, closed to guests and unpublished unless the query members `is_public`, `guest_access` and `published` say otherwise, never wider than the row above it, a wider word answered 422. The optional query members `kind`, `platform`, `architecture`, `language` and `variant` are set on the file row, validated by the downloadFile form; an absent member keeps the row's value, the defaults other, any, any, any on a row the upload creates.
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
 *       - in: query
 *         name: guest_access
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: published
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
 *       - in: query
 *         name: guest_access
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
 *     description: Stream the bytes of one file of a patch, whole or in chunks (x-chunk-index, x-total-chunks, 5 MB chunks assembled on the last one, the info route polled meanwhile). The product, the release, the patch and the file row are created when absent, the caller holding what a create needs (any member of the organization creates a product; its owner, or an admin or owner of the organization, adds to it). The stored name is the real file name from x-file-name. An upload whose checksum matches an original of the organization becomes a symlink to it. Every row the upload creates, product, release, patch and file, is born private, closed to guests and unpublished unless the query members `is_public`, `guest_access` and `published` say otherwise, never wider than the row above it, a wider word answered 422; a row the upload replaces keeps its words. The optional query members `kind`, `platform`, `architecture`, `language` and `variant` are set on the file row, validated by the downloadFile form; an absent member keeps the row's value.
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

    if (isReservedProductName(name)) {
      return conflict(res, req, '/name', 'reserved');
    }

    let download = await Download.findOne({ where: { name, organizationId: organization.id } });
    if (download && !canWriteDownload(req, download, membership)) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('downloads.permissionDenied'),
      });
    }
    let release = download
      ? await DownloadRelease.findOne({ where: { versionNumber, downloadId: download.id } })
      : null;
    let patch = release
      ? await DownloadPatch.findOne({ where: { name: patchName, downloadReleaseId: release.id } })
      : null;
    let file = patch
      ? await DownloadFile.findOne({
          where: { downloadPatchId: patch.id, [Op.or]: [{ key }, { fileName: key }] },
        })
      : null;

    const members = membersOf(req.query);
    const checks = [
      [download, 'download', { name }],
      [release, 'release', { version_number: versionNumber }],
      [patch, 'patch', { name: patchName }],
      [file && Object.keys(members).length === 0, 'downloadFile', { key, ...members }],
    ];
    const refusal = checks
      .filter(([row]) => !row)
      .reduce((found, [, form, values]) => found || refused(res, req, form, values), null);
    if (refusal) {
      return refusal;
    }

    const visibility = {
      isPublic: false,
      guestAccess: false,
      published: false,
      ...visibilityOfQuery(req.query),
    };
    const parents = [
      [download, release],
      [release, patch],
      [patch, file],
    ];
    const wider = parents
      .filter(([parent, child]) => parent && !child)
      .reduce((found, [parent]) => found || widerThanParent(visibility, parent), null);
    if (wider) {
      return refuse(res, req, [wider]);
    }

    if (!download) {
      download = await Download.create({
        name,
        ...visibility,
        userId: req.userId,
        organizationId: organization.id,
      });
    }
    if (!release) {
      release = await DownloadRelease.create({
        versionNumber,
        ...visibility,
        downloadId: download.id,
      });
    }
    if (!patch) {
      patch = await DownloadPatch.create({
        name: patchName,
        ...visibility,
        downloadReleaseId: release.id,
      });
    }

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
      const changes = { ...members };
      if (req.headers['x-file-name'] && file.fileName !== fileName) {
        changes.fileName = fileName;
      }
      if (Object.keys(changes).length > 0) {
        file = await file.update(changes);
      }
    } else {
      file = await DownloadFile.create({
        key,
        fileName,
        ...FILE_DEFAULTS,
        ...members,
        ...visibility,
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

export { upload, refused, isAllowedFileName, extensionOf, tokensOf, levelsFromFileName };
