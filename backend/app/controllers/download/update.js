import fs from 'fs';
import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { conflict, problem } from '../../utils/problem.js';
import { cascadeBeneath, visibilityOf, wordsBeneath } from '../../utils/orgMembership.js';
import { renameDirectory } from '../../utils/paths.js';
import {
  getSecureDownloadPath,
  isReservedProductName,
  renameStoragePaths,
  storagePathFor,
} from './helpers.js';
import { notifyDownloadPublished } from './notifications.js';
const { download: Download, organization: Organization, Sequelize } = db;
const { Op } = Sequelize;

const linkOf = (value, current) => {
  if (value === undefined) {
    return current;
  }
  return value === '' ? null : value;
};

/**
 * @swagger
 * /api/organization/{organization}/download/{name}:
 *   put:
 *     summary: Update a download product
 *     description: Update the name, description, visibility, publication state, family, vendor or links of a download product. Absent fields stay unchanged. A visibility word turned off is turned off on every release, patch and file beneath the product as well; a word turned on reaches them only while recursive is true. The product's owner, or an admin or owner of the organization, may update; a service account acts inside its own organization at its effective role.
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
 *               guest_access:
 *                 type: boolean
 *                 description: Whether guests of the organization may read the product while it is published
 *               published:
 *                 type: boolean
 *                 description: An unpublished product is visible to its creator alone
 *               recursive:
 *                 type: boolean
 *                 description: Carry the visibility words turned on in this request down to every row beneath the product; words turned off always go down
 *               family:
 *                 type: string
 *               vendor:
 *                 type: string
 *               docs_url:
 *                 type: string
 *                 format: uri
 *                 nullable: true
 *                 description: An empty string or null clears the link
 *               notes_url:
 *                 type: string
 *                 format: uri
 *                 nullable: true
 *                 description: An empty string or null clears the link
 *               icon_url:
 *                 type: string
 *                 format: uri
 *                 nullable: true
 *                 description: The product's icon, drawn before its title; the vendor's mark when absent; an empty string or null clears it
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
    guest_access: guestAccess,
    recursive,
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
      if (isReservedProductName(updatedName)) {
        return conflict(res, req, '/name', 'reserved');
      }
      const existingDownload = await Download.findOne({
        where: {
          name: updatedName,
          organizationId: req.organizationId,
          id: { [Op.ne]: download.id },
        },
      });
      if (existingDownload) {
        return conflict(res, req, '/name', organization);
      }
    }

    if (oldFilePath !== newFilePath && fs.existsSync(oldFilePath)) {
      renameDirectory(oldFilePath, newFilePath);
      await renameStoragePaths(
        storagePathFor(organization, name),
        storagePathFor(organization, updatedName)
      );
    }
    if (!fs.existsSync(newFilePath)) {
      fs.mkdirSync(newFilePath, { recursive: true });
    }

    const wasPublished = download.published;

    const updatedDownload = await download.update({
      name: updatedName || name,
      description: description !== undefined ? description : download.description,
      published: published !== undefined ? published : download.published,
      isPublic: isPublic !== undefined ? isPublic : download.isPublic,
      guestAccess: guestAccess !== undefined ? guestAccess : download.guestAccess,
      family: family !== undefined ? family : download.family,
      vendor: vendor !== undefined ? vendor : download.vendor,
      docsUrl: linkOf(docsUrl, download.docsUrl),
      notesUrl: linkOf(notesUrl, download.notesUrl),
      iconUrl: linkOf(iconUrl, download.iconUrl),
    });
    await cascadeBeneath(
      'download',
      [download.id],
      wordsBeneath(visibilityOf(body), recursive === true)
    );

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
