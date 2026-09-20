import fs from 'fs';
import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import { canWriteDownload, resolveOrgMembership } from '../../../utils/orgMembership.js';
import { conflict, problem } from '../../../utils/problem.js';
import { getSecureDownloadPath, renameStoragePaths, storagePathFor } from '../helpers.js';
const { downloadPatches: DownloadPatch } = db;

/**
 * @swagger
 * /api/organization/{organization}/download/{name}/release/{versionNumber}/patch/{patch}:
 *   put:
 *     summary: Update a patch of a release
 *     description: Update a patch's name, kind, description, release date or notes link. A rename moves its directory. The product's owner, or an admin or owner of the organization, may update; a service account acts inside its own organization at its effective role.
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
 *         description: Current patch name
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: The new patch name (the identifier pattern of /api/rules, unique in the release)
 *               kind:
 *                 type: string
 *                 enum: [release, fixpack, interim-fix, hotfix]
 *               description:
 *                 type: string
 *               released_at:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *               notes_url:
 *                 type: string
 *                 format: uri
 *                 nullable: true
 *                 description: An empty string or null clears the link
 *     responses:
 *       200:
 *         description: Patch updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DownloadPatch'
 *       403:
 *         description: The caller may not write the product
 *       404:
 *         description: Organization, product, release or patch not found
 *       409:
 *         description: A patch with the new name already exists for the release
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A value breaks a rule of the patch form
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 */
const update = async (req, res) => {
  const { organization, patch: patchName } = req.params;
  const { name, kind, description, released_at: releasedAt, notes_url: notesUrl } = req.body;

  try {
    const { organizationData, downloadData: download, releaseData: release, patchData } = req;
    const oldFilePath = getSecureDownloadPath(
      organization,
      download.name,
      release.versionNumber,
      patchName
    );
    const newFilePath = getSecureDownloadPath(
      organization,
      download.name,
      release.versionNumber,
      name || patchName
    );

    const membership = await resolveOrgMembership(req, organizationData.id);
    if (!canWriteDownload(req, download, membership)) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('downloads.permissionDenied'),
      });
    }

    if (name && name !== patchName) {
      const existingPatch = await DownloadPatch.findOne({
        where: { name, downloadReleaseId: release.id },
      });
      if (existingPatch) {
        return conflict(res, req, '/name', release.versionNumber);
      }
    }

    const updatePayload = {};
    if (name) {
      updatePayload.name = name;
    }
    if (typeof kind !== 'undefined') {
      updatePayload.kind = kind;
    }
    if (typeof description !== 'undefined') {
      updatePayload.description = description;
    }
    if (typeof releasedAt !== 'undefined') {
      updatePayload.releasedAt = releasedAt;
    }
    if (typeof notesUrl !== 'undefined') {
      updatePayload.notesUrl = notesUrl === '' ? null : notesUrl;
    }

    const updatedPatch = await patchData.update(updatePayload);

    if (oldFilePath !== newFilePath && fs.existsSync(oldFilePath)) {
      if (fs.existsSync(newFilePath)) {
        fs.rmSync(newFilePath, { recursive: true, force: true });
      }
      fs.renameSync(oldFilePath, newFilePath);
      await renameStoragePaths(
        storagePathFor(organization, download.name, release.versionNumber, patchName),
        storagePathFor(organization, download.name, release.versionNumber, name)
      );
    }

    return res.send(updatedPatch);
  } catch (err) {
    log.error.error('Error updating download patch', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { update };
