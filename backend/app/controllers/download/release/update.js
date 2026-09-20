import fs from 'fs';
import { dirname } from 'path';
import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import {
  canWriteDownload,
  resolveOrgMembership,
  visibilityOf,
  widerThanParent,
} from '../../../utils/orgMembership.js';
import { conflict, problem, refuse } from '../../../utils/problem.js';
import { getSecureDownloadPath, renameStoragePaths, storagePathFor } from '../helpers.js';
const { download: Download, downloadReleases: DownloadRelease } = db;

const forbidden = (req, res) =>
  problem(res, req, {
    status: 403,
    type: 'forbidden',
    title: req.__('downloads.permissionDenied'),
  });

const resolveTarget = async (req, res, membership) => {
  const { organization } = req.params;
  const { organizationData, downloadData: download } = req;
  const targetName = req.body.download;
  if (targetName === undefined || targetName === download.name) {
    return download;
  }
  const target = await Download.findOne({
    where: { name: targetName, organizationId: organizationData.id },
  });
  if (!target) {
    problem(res, req, {
      status: 404,
      type: 'not-found',
      title: req.__('downloads.notFoundWithName', { name: targetName, organization }),
    });
    return null;
  }
  if (!canWriteDownload(req, target, membership)) {
    forbidden(req, res);
    return null;
  }
  return target;
};

const releasePayload = body => {
  const payload = {};
  if (body.version_number) {
    payload.versionNumber = body.version_number;
  }
  if (typeof body.description !== 'undefined') {
    payload.description = body.description;
  }
  if (typeof body.release_notes !== 'undefined') {
    payload.releaseNotes = body.release_notes;
  }
  if (typeof body.deprecated !== 'undefined') {
    payload.deprecated = body.deprecated;
  }
  if (typeof body.deprecation_reason !== 'undefined') {
    payload.deprecationReason = body.deprecation_reason;
  }
  return { ...payload, ...visibilityOf(body) };
};

/**
 * @swagger
 * /api/organization/{organization}/download/{name}/release/{versionNumber}:
 *   put:
 *     summary: Update a release of a download product, or move it to another product
 *     description: The product's owner, or an admin or owner of the organization, may update a release; a service account acts inside its own organization at its effective role. A `download` member naming another product of the same organization moves the release there with its patches and files, the caller having to be allowed to write both products; the directory moves with it and every file keeps downloading. The release may never stand wider than the product it sits in, a wider is_public, guest_access or published answering 422 with the pointer.
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
 *               download:
 *                 type: string
 *                 description: The product of the same organization the release moves to (the slug pattern of /api/rules); absent or the current product leaves it in place
 *               description:
 *                 type: string
 *               release_notes:
 *                 type: string
 *                 nullable: true
 *                 description: Release notes (absent = unchanged)
 *               is_public:
 *                 type: boolean
 *                 description: Whether anyone may read the release; never wider than the product (absent = unchanged)
 *               guest_access:
 *                 type: boolean
 *                 description: Whether guests of the organization may read the release while it is published; never wider than the product (absent = unchanged)
 *               published:
 *                 type: boolean
 *                 description: An unpublished release is readable by the product's writers alone (absent = unchanged)
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
 *         description: The caller may not write the product, or the target product
 *       404:
 *         description: Organization, product, release or target product not found
 *       409:
 *         description: A release with the identifier already exists in the product it would sit in
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
  const { version_number: newVersionNumber } = req.body;

  try {
    const { organizationData, downloadData: download } = req;

    const membership = await resolveOrgMembership(req, organizationData.id);
    if (!canWriteDownload(req, download, membership)) {
      return forbidden(req, res);
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

    const target = await resolveTarget(req, res, membership);
    if (!target) {
      return undefined;
    }
    const finalVersionNumber = newVersionNumber || versionNumber;
    const moving = target.id !== download.id;

    if (moving || finalVersionNumber !== versionNumber) {
      const existingRelease = await DownloadRelease.findOne({
        where: { versionNumber: finalVersionNumber, downloadId: target.id },
      });
      if (existingRelease) {
        return conflict(res, req, '/version_number', target.name);
      }
    }

    const payload = releasePayload(req.body);
    const wider = widerThanParent({ ...release.get({ plain: true }), ...payload }, target);
    if (wider) {
      return refuse(res, req, [wider]);
    }

    const updatedRelease = await release.update({
      ...payload,
      ...(moving ? { downloadId: target.id } : {}),
    });

    const oldFilePath = getSecureDownloadPath(organization, download.name, versionNumber);
    const newFilePath = getSecureDownloadPath(organization, target.name, finalVersionNumber);
    if (oldFilePath !== newFilePath && fs.existsSync(oldFilePath)) {
      if (fs.existsSync(newFilePath)) {
        fs.rmSync(newFilePath, { recursive: true, force: true });
      }
      fs.mkdirSync(dirname(newFilePath), { recursive: true });
      fs.renameSync(oldFilePath, newFilePath);
      await renameStoragePaths(
        storagePathFor(organization, download.name, versionNumber),
        storagePathFor(organization, target.name, finalVersionNumber)
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
