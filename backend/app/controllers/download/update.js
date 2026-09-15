import fs from 'fs';
import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { conflict, problem } from '../../utils/problem.js';
import { getSecureDownloadPath, renameStoragePaths, storagePathFor } from './helpers.js';
import { notifyDownloadPublished } from './notifications.js';
const { download: Download, organization: Organization } = db;

/**
 * @swagger
 * /api/organization/{organization}/download/{name}:
 *   put:
 *     summary: Update a download product
 *     description: Update the name, description, visibility, publication state, family, vendor or links of a download product. Absent fields stay unchanged. The product's owner, or an admin or owner of the organization, may update; a service account acts inside its own organization at its effective role.
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
 *         description: Current product name
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: New product name (the slug pattern of /api/rules, unique in the organization)
 *               description:
 *                 type: string
 *               is_public:
 *                 type: boolean
 *               published:
 *                 type: boolean
 *                 description: An unpublished product is visible to its creator alone
 *               family:
 *                 type: string
 *               vendor:
 *                 type: string
 *               docs_url:
 *                 type: string
 *                 format: uri
 *               notes_url:
 *                 type: string
 *                 format: uri
 *               icon_url:
 *                 type: string
 *                 format: uri
 *                 description: The product's icon, drawn before its title; the vendor's mark when absent
 *     responses:
 *       200:
 *         description: Download updated successfully
 *       403:
 *         description: The caller neither owns the product nor administers the organization
 *       404:
 *         description: Download not found
 *       409:
 *         description: A download with the new name already exists in the organization
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A value breaks a rule of the download form
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 */
const update = async (req, res) => {
  const { organization, name } = req.params;
  const body = req.body || {};
  const {
    name: updatedName,
    description,
    published,
    is_public: isPublic,
    family,
    vendor,
    docs_url: docsUrl,
    notes_url: notesUrl,
    icon_url: iconUrl,
  } = body;
  const oldFilePath = getSecureDownloadPath(organization, name);
  const newFilePath = getSecureDownloadPath(organization, updatedName || name);

  try {
    const download = await Download.findOne({
      where: { name, organizationId: req.organizationId },
    });
    if (!download) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('downloads.notFound'),
      });
    }

    const isOwner = download.userId === req.userId;
    const canUpdate = isOwner || ['admin', 'owner'].includes(req.userOrgRole);

    if (!canUpdate) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('downloads.permissionDenied'),
      });
    }

    if (updatedName && updatedName !== name) {
      const existingDownload = await Download.findOne({
        where: { name: updatedName, organizationId: req.organizationId },
      });
      if (existingDownload) {
        return conflict(res, req, '/name', organization);
      }
    }

    if (!fs.existsSync(newFilePath)) {
      fs.mkdirSync(newFilePath, { recursive: true });
    }

    if (oldFilePath !== newFilePath && fs.existsSync(oldFilePath)) {
      if (fs.existsSync(newFilePath)) {
        fs.rmSync(newFilePath, { recursive: true, force: true });
      }
      fs.renameSync(oldFilePath, newFilePath);
      await renameStoragePaths(
        storagePathFor(organization, name),
        storagePathFor(organization, updatedName)
      );
    }

    const wasPublished = download.published;

    const updatedDownload = await download.update({
      name: updatedName || name,
      description: description !== undefined ? description : download.description,
      published: published !== undefined ? published : download.published,
      isPublic: isPublic !== undefined ? isPublic : download.isPublic,
      family: family !== undefined ? family : download.family,
      vendor: vendor !== undefined ? vendor : download.vendor,
      docsUrl: docsUrl !== undefined ? docsUrl : download.docsUrl,
      notesUrl: notesUrl !== undefined ? notesUrl : download.notesUrl,
      iconUrl: iconUrl !== undefined ? iconUrl : download.iconUrl,
    });

    if (updatedDownload.published && !wasPublished) {
      const organizationData = await Organization.findByPk(updatedDownload.organizationId);
      notifyDownloadPublished(organizationData, updatedDownload);
    }

    return res.send(updatedDownload);
  } catch (err) {
    log.error.error('Error updating download', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { update };
