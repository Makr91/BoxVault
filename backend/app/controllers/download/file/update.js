import fs from 'fs';
import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import {
  canWriteDownload,
  resolveOrgMembership,
  visibilityOf,
  widerThanParent,
} from '../../../utils/orgMembership.js';
import { conflict, problem, refuse } from '../../../utils/problem.js';
import { absolutePath, relinkTo, relocateFile, resolveTarget, storagePathFor } from '../helpers.js';
const { downloadFiles: DownloadFile, Sequelize } = db;
const { Op } = Sequelize;

const MISSING_TITLES = {
  download: 'downloads.notFound',
  release: 'downloads.releases.notFound',
  patch: 'downloads.patches.notFound',
};

/**
 * @swagger
 * /api/organization/{organization}/download/{name}/release/{versionNumber}/patch/{patch}/file/{key}:
 *   put:
 *     summary: Update a file row of a patch, or move it to another patch
 *     description: Update the key, file name, kind, platform, architecture, language, variant, declared checksum or the visibility words is_public, guest_access and published of a file, a word wider than the patch answered 422. A new file name renames the stored file. The members `download`, `release` and `patch` name the patch the file moves to, each defaulting to the current one, the caller having to be allowed to write both products; the bytes move with the row and every link keeps working; a key already taken in the target patch answers 409, a target that does not exist 404, and the file may never stand wider than the patch it lands in. The product's owner, or an admin or owner of the organization, may update; a service account acts inside its own organization at its effective role.
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
 *         description: Product name
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Release identifier
 *       - in: path
 *         name: patch
 *         required: true
 *         schema:
 *           type: string
 *         description: Patch name
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: Current file key, or its file name
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               key:
 *                 type: string
 *               file_name:
 *                 type: string
 *               download:
 *                 type: string
 *                 description: The product of the same organization the file moves to (the slug pattern of /api/rules); absent or the current one leaves it in place
 *               release:
 *                 type: string
 *                 description: The release the file moves to, under `download`; absent means the current release identifier
 *               patch:
 *                 type: string
 *                 description: The patch the file moves to, under `release`; absent means the current patch name
 *               kind:
 *                 type: string
 *               platform:
 *                 type: string
 *               architecture:
 *                 type: string
 *               language:
 *                 type: string
 *               variant:
 *                 type: string
 *               checksum_type:
 *                 type: string
 *               checksum:
 *                 type: string
 *               is_public:
 *                 type: boolean
 *               guest_access:
 *                 type: boolean
 *               published:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: File updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DownloadFile'
 *       403:
 *         description: The caller may not write the product, or the target product
 *       404:
 *         description: Organization, product, release, patch, file or target not found
 *       409:
 *         description: A file with the key already exists for the patch it would sit in
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A value breaks a rule of the downloadFile form
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 */
const update = async (req, res) => {
  const {
    key,
    file_name: fileName,
    kind,
    platform,
    architecture,
    language,
    variant,
    checksum_type: checksumType,
    checksum,
  } = req.body;

  try {
    const { organization, download, release, patch, file } = req.entities;

    const membership = await resolveOrgMembership(req, organization.id);
    if (!canWriteDownload(req, download, membership)) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('downloads.permissionDenied'),
      });
    }

    const target = await resolveTarget(
      { organizationId: organization.id, download, release, patch },
      req.body
    );
    if (target.missing) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__(MISSING_TITLES[target.missing]),
      });
    }
    if (target.download.id !== download.id && !canWriteDownload(req, target.download, membership)) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('downloads.permissionDenied'),
      });
    }
    const moving = target.patch.id !== patch.id;
    const finalKey = key || file.key;

    if (moving || finalKey !== file.key) {
      const existingFile = await DownloadFile.findOne({
        where: { key: finalKey, downloadPatchId: target.patch.id, id: { [Op.ne]: file.id } },
      });
      if (existingFile) {
        return conflict(res, req, '/key', target.patch.name);
      }
    }

    const updatePayload = {};
    if (key) {
      updatePayload.key = key;
    }
    if (typeof kind !== 'undefined') {
      updatePayload.kind = kind;
    }
    if (typeof platform !== 'undefined') {
      updatePayload.platform = platform;
    }
    if (typeof architecture !== 'undefined') {
      updatePayload.architecture = architecture;
    }
    if (typeof language !== 'undefined') {
      updatePayload.language = language;
    }
    if (typeof variant !== 'undefined') {
      updatePayload.variant = variant;
    }
    if (typeof checksumType !== 'undefined') {
      updatePayload.checksumType = checksumType;
    }
    if (typeof checksum !== 'undefined') {
      updatePayload.checksum = checksum ? checksum.toLowerCase() : null;
    }
    Object.assign(updatePayload, visibilityOf(req.body));

    const wider = widerThanParent({ ...file.get({ plain: true }), ...updatePayload }, target.patch);
    if (wider) {
      return refuse(res, req, [wider]);
    }

    if (fileName && fileName !== file.fileName) {
      updatePayload.fileName = fileName;
      if (file.storagePath) {
        const newStoragePath = storagePathFor(
          organization.name,
          download.name,
          release.versionNumber,
          patch.name,
          fileName
        );
        const oldPath = absolutePath(file.storagePath);
        if (fs.lstatSync(oldPath, { throwIfNoEntry: false })) {
          fs.renameSync(oldPath, absolutePath(newStoragePath));
        }
        updatePayload.storagePath = newStoragePath;
      }
    }

    let updatedFile = await file.update(updatePayload);
    if (updatePayload.storagePath && updatedFile.original) {
      await relinkTo(updatedFile);
    }
    if (moving) {
      updatedFile = await relocateFile(organization.name, updatedFile, target);
    }

    return res.send(updatedFile);
  } catch (err) {
    log.error.error('Error updating download file', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { update };
