import fs from 'fs';
import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import { canWriteDownload, resolveOrgMembership } from '../../../utils/orgMembership.js';
import { conflict, problem } from '../../../utils/problem.js';
import { absolutePath, relinkTo, storagePathFor } from '../helpers.js';
const { downloadFiles: DownloadFile } = db;

/**
 * @swagger
 * /api/organization/{organization}/download/{name}/release/{versionNumber}/patch/{patch}/file/{key}:
 *   put:
 *     summary: Update a file row of a patch
 *     description: Update the key, file name, kind, platform, architecture, language, variant or declared checksum of a file. A new file name renames the stored file. The product's owner, or an admin or owner of the organization, may update; a service account acts inside its own organization at its effective role.
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
 *     responses:
 *       200:
 *         description: File updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DownloadFile'
 *       403:
 *         description: The caller may not write the product
 *       404:
 *         description: Organization, product, release, patch or file not found
 *       409:
 *         description: A file with the new key already exists for the patch
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

    if (key && key !== file.key) {
      const existingFile = await DownloadFile.findOne({
        where: { key, downloadPatchId: patch.id },
      });
      if (existingFile) {
        return conflict(res, req, '/key', patch.name);
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
          fs.copyFileSync(oldPath, absolutePath(newStoragePath));
          fs.unlinkSync(oldPath);
        }
        updatePayload.storagePath = newStoragePath;
      }
    }

    const updatedFile = await file.update(updatePayload);
    if (updatePayload.storagePath && updatedFile.original) {
      await relinkTo(updatedFile);
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
