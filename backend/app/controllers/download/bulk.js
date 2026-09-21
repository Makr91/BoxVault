import fs from 'fs';
import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
import { VISIBILITY_CHANGES, cascadeBeneath, wordsBeneath } from '../../utils/orgMembership.js';
import { getSecureDownloadPath, ownWords, removeDownloadFiles } from './helpers.js';
import { notifyDownloadPublished } from './notifications.js';
const {
  download: Download,
  downloadReleases: DownloadRelease,
  downloadPatches: DownloadPatch,
  downloadFiles: DownloadFile,
  organization: Organization,
} = db;

const linkOf = value => (value === '' ? null : value);

/**
 * The columns a `set` writes on a product, present values only.
 * @param {Object} values - The body's values member
 * @returns {Object} The model-named payload
 */
const productValues = values => {
  const payload = {};
  if (typeof values.description !== 'undefined') {
    payload.description = values.description;
  }
  if (typeof values.family !== 'undefined') {
    payload.family = values.family;
  }
  if (typeof values.vendor !== 'undefined') {
    payload.vendor = values.vendor;
  }
  if (typeof values.docs_url !== 'undefined') {
    payload.docsUrl = linkOf(values.docs_url);
  }
  if (typeof values.notes_url !== 'undefined') {
    payload.notesUrl = linkOf(values.notes_url);
  }
  if (typeof values.icon_url !== 'undefined') {
    payload.iconUrl = linkOf(values.icon_url);
  }
  return payload;
};

/**
 * @swagger
 * /api/organization/{organization}/download/bulk:
 *   post:
 *     summary: One action across a selection of download products
 *     description: Each row is isolated and checked against the single route's permission (the product's owner, or an admin or owner of the organization); a refused row is counted as skipped and named in errors with its code (not_found, forbidden, internal). A closing verb (make_private, unpublish, deny_guests) closes every release, patch and file beneath each product as well; an opening verb reaches them only while recursive is true. `set` writes the given values (description, family, vendor, docs_url, notes_url, icon_url) on every named product, an empty string clearing a link. `reconcile` carries every word a product holds off down to every release, patch and file beneath it, so the tree stands within the product again. A delete removes releases, patches, file records and the directory the way the single delete does.
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action, names]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [delete, set, reconcile, make_public, make_private, publish, unpublish, allow_guests, deny_guests]
 *               names:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: string
 *                 description: Product names
 *               recursive:
 *                 type: boolean
 *                 description: Carry an opening verb down to every row beneath each product; a closing verb always goes down
 *               values:
 *                 type: object
 *                 description: Required while action is set
 *                 properties:
 *                   description:
 *                     type: string
 *                   family:
 *                     type: string
 *                   vendor:
 *                     type: string
 *                   docs_url:
 *                     type: string
 *                     format: uri
 *                   notes_url:
 *                     type: string
 *                     format: uri
 *                   icon_url:
 *                     type: string
 *                     format: uri
 *     responses:
 *       200:
 *         description: The outcome per row
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BulkResult'
 *       403:
 *         description: The caller is not a member of the organization
 *       404:
 *         description: Organization not found
 *       422:
 *         description: A value breaks a rule of the bulkItem form
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
const bulk = async (req, res) => {
  const { organization } = req.params;
  const { action, names, recursive, values } = req.body;
  const errors = [];
  let processed = 0;

  if (action === 'set' && !values) {
    return problem(res, req, {
      status: 422,
      type: 'validation',
      errors: [{ pointer: '/values', rule: 'required', params: {} }],
    });
  }

  const row = async name => {
    const download = await Download.findOne({
      where: { name, organizationId: req.organizationId },
      include: [
        {
          model: DownloadRelease,
          as: 'releases',
          include: [
            {
              model: DownloadPatch,
              as: 'patches',
              include: [{ model: DownloadFile, as: 'files' }],
            },
          ],
        },
      ],
    });
    if (!download) {
      return 'not_found';
    }
    const isOwner = download.userId === req.userId;
    if (!(isOwner || ['admin', 'owner'].includes(req.userOrgRole))) {
      return 'forbidden';
    }
    if (action === 'delete') {
      const files = download.releases
        .flatMap(release => release.patches)
        .flatMap(patch => patch.files);
      await removeDownloadFiles(files);
      await download.destroy();
      try {
        await fs.promises.rm(getSecureDownloadPath(organization, name), {
          recursive: true,
          force: true,
        });
      } catch (err) {
        log.app.info(`Could not delete the download directory: ${err}`);
      }
      return null;
    }
    if (action === 'set') {
      await download.update(productValues(values));
      return null;
    }
    if (action === 'reconcile') {
      await cascadeBeneath('download', [download.id], wordsBeneath(ownWords(download), false));
      return null;
    }
    const wasPublished = download.published;
    const change = VISIBILITY_CHANGES[action];
    const updatedDownload = await download.update(change);
    await cascadeBeneath('download', [download.id], wordsBeneath(change, recursive === true));
    if (updatedDownload.published && !wasPublished) {
      const organizationData = await Organization.findByPk(updatedDownload.organizationId);
      notifyDownloadPublished(organizationData, updatedDownload);
    }
    return null;
  };

  const run = async index => {
    if (index >= names.length) {
      return;
    }
    const name = names[index];
    const code = await row(name).catch(err => {
      log.error.error(`Bulk ${action} failed for download ${name}`, err);
      return 'internal';
    });
    if (code) {
      errors.push({ name, code });
    } else {
      processed += 1;
    }
    await run(index + 1);
  };

  await run(0);
  log.app.info(`Bulk download action ${action}: processed=${processed} skipped=${errors.length}`);
  return res.send({ processed, skipped: errors.length, errors });
};

export { bulk };
