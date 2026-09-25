import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import {
  VISIBILITY_CHANGES,
  canWriteDownload,
  resolveOrgMembership,
  widerThanParent,
} from '../../../utils/orgMembership.js';
import { problem } from '../../../utils/problem.js';
import { relocateFile, removeDownloadFile, resolveTarget } from '../helpers.js';
const { downloadFiles: DownloadFile, sequelize, Sequelize } = db;
const { Op } = Sequelize;

const MISSING_TITLES = {
  download: 'downloads.notFound',
  release: 'downloads.releases.notFound',
  patch: 'downloads.patches.notFound',
};

/**
 * The columns a `set` writes on a file, present values only.
 * @param {Object} values - The body's values member
 * @returns {Object} The model-named payload
 */
const fileValues = values => {
  const payload = {};
  ['kind', 'platform', 'architecture', 'language', 'variant'].forEach(member => {
    if (typeof values[member] !== 'undefined') {
      payload[member] = values[member];
    }
  });
  if (typeof values.source_url !== 'undefined') {
    payload.sourceUrl = values.source_url || null;
  }
  return payload;
};

/**
 * @swagger
 * /api/organization/{organization}/download/{name}/release/{versionNumber}/patch/{patch}/file/bulk:
 *   post:
 *     summary: One action across a selection of files of a patch
 *     description: The product's owner, or an admin or owner of the organization, may act; a service account acts inside its own organization at its effective role. Each row, named by its key or its file name, is isolated; a missing file is counted as skipped and named in errors with not_found, a thrown row with internal, a visibility change that would set the file wider than its patch with forbidden. `set` writes the given values (kind, platform, architecture, language, variant, source_url) on every named file. `move` moves every named file, with its bytes, to the patch `download`, `release` and `patch` name (each defaulting to the current one), the caller having to be allowed to write both products, a file whose key is taken there counted as conflict and one wider than the target patch as forbidden. A delete removes the row and its bytes in a transaction the way the single delete does, an original handing its bytes to one of its links first.
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
 *                 enum: [delete, set, move, make_public, make_private, publish, unpublish, allow_guests, deny_guests]
 *               names:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: string
 *                 description: File keys or file names
 *               download:
 *                 type: string
 *                 description: The product the files move to; the current one when absent
 *               release:
 *                 type: string
 *                 description: The release the files move to; the current identifier when absent
 *               patch:
 *                 type: string
 *                 description: The patch the files move to; the current name when absent
 *               values:
 *                 type: object
 *                 description: Required while action is set
 *                 properties:
 *                   kind:
 *                     type: string
 *                   platform:
 *                     type: string
 *                   architecture:
 *                     type: string
 *                   language:
 *                     type: string
 *                   variant:
 *                     type: string
 *                   source_url:
 *                     type: string
 *                     format: uri
 *                     nullable: true
 *     responses:
 *       200:
 *         description: The outcome per row
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BulkResult'
 *       403:
 *         description: The caller may not write the product, or the target product
 *       404:
 *         description: Organization, product, release, patch or target not found
 *       422:
 *         description: A value breaks a rule of the bulkLeaf form
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
const bulk = async (req, res) => {
  const { action, names, values } = req.body;
  const { organizationData, downloadData: download, releaseData: release, patchData: patch } = req;

  const membership = await resolveOrgMembership(req, organizationData.id);
  if (!canWriteDownload(req, download, membership)) {
    return problem(res, req, {
      status: 403,
      type: 'forbidden',
      title: req.__('files.delete.permissionDenied'),
    });
  }

  if (action === 'set' && !values) {
    return problem(res, req, {
      status: 422,
      type: 'validation',
      errors: [{ pointer: '/values', rule: 'required', params: {} }],
    });
  }

  let target = { download, release, patch };
  if (action === 'move') {
    target = await resolveTarget(
      { organizationId: organizationData.id, download, release, patch },
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
  }

  const errors = [];
  let processed = 0;

  const move = async file => {
    if (target.patch.id === patch.id) {
      return null;
    }
    const taken = await DownloadFile.findOne({
      where: { key: file.key, downloadPatchId: target.patch.id },
    });
    if (taken) {
      return 'conflict';
    }
    if (widerThanParent(file, target.patch)) {
      return 'forbidden';
    }
    await relocateFile(organizationData.name, file, target);
    return null;
  };

  const row = async key => {
    const file = await DownloadFile.findOne({
      where: { downloadPatchId: patch.id, [Op.or]: [{ key }, { fileName: key }] },
    });
    if (!file) {
      return 'not_found';
    }
    if (action === 'set') {
      await file.update(fileValues(values));
      return null;
    }
    if (action === 'move') {
      return move(file);
    }
    if (action !== 'delete') {
      const change = VISIBILITY_CHANGES[action];
      if (widerThanParent({ ...file.get({ plain: true }), ...change }, patch)) {
        return 'forbidden';
      }
      await file.update(change);
      return null;
    }
    await removeDownloadFile(file);
    const transaction = await sequelize.transaction();
    try {
      await file.destroy({ transaction });
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
    return null;
  };

  const run = async index => {
    if (index >= names.length) {
      return;
    }
    const name = names[index];
    const code = await row(name).catch(err => {
      log.error.error(`Bulk ${action} failed for download file ${name}`, err);
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
  log.app.info(
    `Bulk download file action ${action}: processed=${processed} skipped=${errors.length}`
  );
  return res.send({ processed, skipped: errors.length, errors });
};

export { bulk };
