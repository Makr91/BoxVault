import fs from 'fs';
import { dirname } from 'path';
import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import {
  canWriteDownload,
  canWritePendingUpload,
  visibilityOf,
  widerThanParent,
} from '../../../utils/orgMembership.js';
import { conflict, problem, refuse } from '../../../utils/problem.js';
import { getRulesDocument } from '../../../utils/rules.js';
import { validateObject } from '../../../utils/validation.js';
import { ensureDirSync, safeRmdirSync } from '../../../utils/fsHelper.js';
import { addressOf, recordFile } from '../../../middleware/uploadDownload.js';
import {
  absolutePath,
  getPendingPath,
  getSecureDownloadPath,
  isReservedProductName,
  promoteOriginal,
} from '../helpers.js';
import { isAllowedFileName } from '../file/upload.js';
import { resolvePending } from './resolve.js';

const {
  download: Download,
  downloadReleases: DownloadRelease,
  downloadPatches: DownloadPatch,
  downloadFiles: DownloadFile,
  Sequelize,
} = db;
const { Op } = Sequelize;

const FILE_MEMBERS = [
  'kind',
  'platform',
  'architecture',
  'language',
  'variant',
  'checksum_type',
  'checksum',
  'is_public',
  'guest_access',
  'published',
];

const FILE_DEFAULTS = { kind: 'other', platform: 'any', architecture: 'any', language: 'any' };

const NO_CHECKSUM_TYPE = 'null';

const POINTERS = {
  download: { '/name': '/product' },
  release: { '/version_number': '/release' },
  patch: { '/name': '/patch' },
};

const definedOf = entries =>
  Object.fromEntries(entries.filter(([, value]) => value !== undefined && value !== ''));

const givenOf = body => {
  const given = definedOf(FILE_MEMBERS.map(member => [member, body[member]]));
  if (String(given.checksum_type ?? NO_CHECKSUM_TYPE).toLowerCase() === NO_CHECKSUM_TYPE) {
    delete given.checksum;
  }
  return given;
};

const errorsOf = (form, values) => {
  const document = getRulesDocument();
  return validateObject(document.forms[form], values, document).map(error => ({
    ...error,
    pointer: POINTERS[form]?.[error.pointer] ?? error.pointer,
  }));
};

const attributesOf = given => ({
  kind: given.kind,
  platform: given.platform,
  architecture: given.architecture,
  language: given.language,
  variant: given.variant,
});

const settleFileRow = async (file, patch, key, fileName, attributes, visibility) => {
  if (!file) {
    return DownloadFile.create({
      key,
      fileName,
      kind: attributes.kind || FILE_DEFAULTS.kind,
      platform: attributes.platform || FILE_DEFAULTS.platform,
      architecture: attributes.architecture || FILE_DEFAULTS.architecture,
      language: attributes.language || FILE_DEFAULTS.language,
      variant: attributes.variant || null,
      ...visibility,
      fileSize: 0,
      original: true,
      downloadPatchId: patch.id,
    });
  }
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
  return file.update({ fileName, ...definedOf(Object.entries(attributes)) });
};

/**
 * @swagger
 * /api/organization/{organization}/download/pending/{id}/place:
 *   post:
 *     summary: Place a pending upload
 *     description: The second step of a person's upload. Takes `product`, `release`, `patch` (`release` when absent) and the downloadFile form's members (`key` the file name when absent), validated as the level routes validate them (the download, release, patch and downloadFile forms, 422 with pointers); creates the product, the release, the patch and the file row when absent, every row it creates born private, closed to guests and unpublished unless `is_public`, `guest_access` and `published` say otherwise, never wider than the row above it, a wider word answered 422; moves the bytes to the product path with the checksum, deduplication and symlink rules of the level upload, drops the pending upload and answers the file's address. The member who uploaded it, or an admin or owner of the organization, may place it; an existing product takes its owner, or an admin or owner of the organization.
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
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - product
 *               - release
 *             properties:
 *               product:
 *                 type: string
 *                 description: Product name (the slug pattern of /api/rules)
 *               release:
 *                 type: string
 *                 description: Release identifier (the identifier pattern of /api/rules)
 *               patch:
 *                 type: string
 *                 description: Patch name, release when absent
 *               is_public:
 *                 type: boolean
 *                 description: Whether every row this call creates is public
 *               guest_access:
 *                 type: boolean
 *                 description: Whether every row this call creates is open to guests of the organization
 *               published:
 *                 type: boolean
 *                 description: Whether every row this call creates is published
 *               key:
 *                 type: string
 *                 description: File key, the file name when absent
 *               file_name:
 *                 type: string
 *                 description: The name the file is stored under, the uploaded name when absent
 *               kind:
 *                 type: string
 *                 enum: [installer, fixpack, hotfix, interim-fix, container-image, package, template, notes, tool, link, other]
 *               platform:
 *                 type: string
 *                 enum: [linux, windows, macos, omnios, other, any]
 *               architecture:
 *                 type: string
 *                 enum: [x64, x86, arm64, other, any]
 *               language:
 *                 type: string
 *               variant:
 *                 type: string
 *               checksum_type:
 *                 type: string
 *                 enum: [NULL, MD5, SHA1, SHA256, SHA384, SHA512]
 *               checksum:
 *                 type: string
 *     responses:
 *       200:
 *         description: The file's address
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 product:
 *                   type: string
 *                 release:
 *                   type: string
 *                 patch:
 *                   type: string
 *                 key:
 *                   type: string
 *       400:
 *         description: The file name is not allowed
 *       403:
 *         description: The caller may not place it, or may not write the product
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: Organization or pending upload not found, or its bytes were never assembled
 *       422:
 *         description: A product name that is not a slug, a release or patch that is not an identifier, or a file member that breaks its rule
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 */
const place = async (req, res) => {
  try {
    const resolved = await resolvePending(req, res);
    if (!resolved) {
      return undefined;
    }
    const { organization, membership, pending } = resolved;

    if (!canWritePendingUpload(req, pending, membership)) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('downloads.permissionDenied'),
      });
    }

    const body = req.body || {};
    const name = body.product ?? '';
    const versionNumber = body.release ?? '';
    const patchName = body.patch || 'release';
    const fileName = body.file_name || pending.fileName;
    const key = body.key || fileName;
    const given = givenOf(body);

    if (!isAllowedFileName(fileName)) {
      return problem(res, req, {
        status: 400,
        type: 'bad-request',
        title: req.__('files.invalidFileName'),
      });
    }

    if (isReservedProductName(name)) {
      return conflict(res, req, '/product', 'reserved');
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

    const checks = [
      [download, 'download', { name }],
      [release, 'release', { version_number: versionNumber }],
      [patch, 'patch', { name: patchName }],
      [null, 'downloadFile', { key, file_name: fileName, ...given }],
    ];
    const errors = checks
      .filter(([row]) => !row)
      .flatMap(([, form, values]) => errorsOf(form, values));
    if (errors.length > 0) {
      return refuse(res, req, errors);
    }

    const source = absolutePath(pending.storagePath);
    if (!pending.checksum || !fs.existsSync(source)) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('files.notFound'),
      });
    }

    const visibility = {
      isPublic: false,
      guestAccess: false,
      published: false,
      ...visibilityOf(body),
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

    file = await settleFileRow(file, patch, key, fileName, attributesOf(given), visibility);

    const entities = { organization, download, release, patch, file };
    const finalPath = getSecureDownloadPath(
      organization.name,
      download.name,
      release.versionNumber,
      patch.name,
      fileName
    );
    ensureDirSync(dirname(finalPath));
    fs.renameSync(source, finalPath);
    await recordFile(
      entities,
      Number(pending.size),
      pending.checksum,
      pending.checksumType,
      finalPath
    );

    safeRmdirSync(getPendingPath(organization.name, pending.id));
    await pending.destroy();

    log.file.info(`Pending upload placed: ${pending.id} at ${file.storagePath}.`);

    return res.send(addressOf(entities));
  } catch (err) {
    log.error.error('Error placing pending upload', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { place };
