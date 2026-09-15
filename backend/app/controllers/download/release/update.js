import fs from 'fs';
import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import { canWriteDownload, resolveOrgMembership } from '../../../utils/orgMembership.js';
import { conflict, problem } from '../../../utils/problem.js';
import { getSecureDownloadPath, renameStoragePaths, storagePathFor } from '../helpers.js';
const { downloadReleases: DownloadRelease } = db;

/**
 * @swagger
 * /api/organization/{organization}/download/{name}/release/{versionNumber}:
 *   put:
 *     summary: Update a release of a download product
 *     description: The product's owner, or an admin or owner of the organization, may update a release; a service account acts inside its own organization at its effective role.
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
 *         description: Current release identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               version_number:
 *                 type: string
 *                 description: The new release identifier (the identifier pattern of /api/rules, unique in the product)
 *               description:
 *                 type: string
 *               release_notes:
 *                 type: string
 *                 nullable: true
 *                 description: Release notes (absent = unchanged)
 *               deprecated:
 *                 type: boolean
 *                 description: Setting true requires a non-empty deprecation_reason in this request
 *               deprecation_reason:
 *                 type: string
 *                 maxLength: 512
 *                 nullable: true
 *                 description: Why the release is deprecated (absent = unchanged)
 *     responses:
 *       200:
 *         description: Release updated successfully
 *       403:
 *         description: The caller may not write the product
 *       404:
 *         description: Organization, product or release not found
 *       409:
 *         description: A release with the new identifier already exists for the product
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A value breaks a rule of the release form
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 */
const update = async (req, res) => {
  const { organization, versionNumber } = req.params;
  const {
    version_number: newVersionNumber,
    description,
    release_notes: releaseNotes,
    deprecated,
    deprecation_reason: deprecationReason,
  } = req.body;

  try {
    const { organizationData, downloadData: download } = req;
    const oldFilePath = getSecureDownloadPath(organization, download.name, versionNumber);
    const newFilePath = getSecureDownloadPath(
      organization,
      download.name,
      newVersionNumber || versionNumber
    );

    const membership = await resolveOrgMembership(req, organizationData.id);
    if (!canWriteDownload(req, download, membership)) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('downloads.permissionDenied'),
      });
    }

    const release = await DownloadRelease.findOne({
      where: { versionNumber, downloadId: download.id },
    });
    if (!release) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('downloads.releases.notFound'),
      });
    }

    if (newVersionNumber && newVersionNumber !== versionNumber) {
      const existingRelease = await DownloadRelease.findOne({
        where: { versionNumber: newVersionNumber, downloadId: download.id },
      });
      if (existingRelease) {
        return conflict(res, req, '/version_number', download.name);
      }
    }

    const updatePayload = {};
    if (newVersionNumber) {
      updatePayload.versionNumber = newVersionNumber;
    }
    if (typeof description !== 'undefined') {
      updatePayload.description = description;
    }
    if (typeof releaseNotes !== 'undefined') {
      updatePayload.releaseNotes = releaseNotes;
    }
    if (typeof deprecated !== 'undefined') {
      updatePayload.deprecated = deprecated;
    }
    if (typeof deprecationReason !== 'undefined') {
      updatePayload.deprecationReason = deprecationReason;
    }

    const updatedRelease = await release.update(updatePayload);

    if (oldFilePath !== newFilePath && fs.existsSync(oldFilePath)) {
      if (fs.existsSync(newFilePath)) {
        fs.rmSync(newFilePath, { recursive: true, force: true });
      }
      fs.renameSync(oldFilePath, newFilePath);
      await renameStoragePaths(
        storagePathFor(organization, download.name, versionNumber),
        storagePathFor(organization, download.name, newVersionNumber)
      );
    }

    return res.send(updatedRelease);
  } catch (err) {
    log.error.error('Error updating download release', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { update };
