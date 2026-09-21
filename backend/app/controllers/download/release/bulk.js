import fs from 'fs';
import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import {
  VISIBILITY_CHANGES,
  canWriteDownload,
  cascadeBeneath,
  resolveOrgMembership,
  widerThanParent,
  wordsBeneath,
} from '../../../utils/orgMembership.js';
import { problem } from '../../../utils/problem.js';
import { renameDirectory } from '../../../utils/paths.js';
import {
  getSecureDownloadPath,
  ownWords,
  removeDownloadFiles,
  renameStoragePaths,
  storagePathFor,
} from '../helpers.js';
const {
  download: Download,
  downloadReleases: DownloadRelease,
  downloadPatches: DownloadPatch,
  downloadFiles: DownloadFile,
} = db;

/**
 * The columns a `set` writes on a release, present values only.
 * @param {Object} values - The body's values member
 * @returns {Object} The model-named payload
 */
const releaseValues = values => {
  const payload = {};
  if (typeof values.description !== 'undefined') {
    payload.description = values.description;
  }
  if (typeof values.release_notes !== 'undefined') {
    payload.releaseNotes = values.release_notes;
  }
  return payload;
};

/**
 * @swagger
 * /api/organization/{organization}/download/{name}/release/bulk:
 *   post:
 *     summary: One action across a selection of releases of a download product
 *     description: The product's owner, or an admin or owner of the organization, may act; a service account acts inside its own organization at its effective role. Each row is isolated; a missing release is counted as skipped and named in errors with not_found, a thrown row with internal, a visibility change that would set the release wider than its product with forbidden. A closing verb closes every patch and file beneath each release as well; an opening verb reaches them only while recursive is true. `set` writes the given values (description, release_notes) on every named release. `move` moves every named release, with its patches, files and directory, to the product `download` names in the same organization, the caller having to be allowed to write both products, a release whose identifier is taken there counted as conflict and one wider than the target product as forbidden. `reconcile` carries every word a release holds off down to its patches and files. A delete removes patches, file records and the directory the way the single delete does; a deprecate carries the required deprecation_reason as the single update does.
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
 *                 enum: [delete, deprecate, set, move, reconcile, make_public, make_private, publish, unpublish, allow_guests, deny_guests]
 *               names:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: string
 *                 description: Release identifiers
 *               deprecation_reason:
 *                 type: string
 *                 maxLength: 512
 *                 description: Required while action is deprecate
 *               recursive:
 *                 type: boolean
 *                 description: Carry an opening verb down to every row beneath each release; a closing verb always goes down
 *               download:
 *                 type: string
 *                 description: The product the releases move to; required while action is move
 *               values:
 *                 type: object
 *                 description: Required while action is set
 *                 properties:
 *                   description:
 *                     type: string
 *                   release_notes:
 *                     type: string
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
 *         description: Organization, product or target product not found
 *       422:
 *         description: A value breaks a rule of the bulkVersion form
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
const bulk = async (req, res) => {
  const { organization } = req.params;
  const {
    action,
    names,
    deprecation_reason: deprecationReason,
    recursive,
    values,
    download: targetName,
  } = req.body;
  const { organizationData, downloadData: download } = req;

  const membership = await resolveOrgMembership(req, organizationData.id);
  if (!canWriteDownload(req, download, membership)) {
    return problem(res, req, {
      status: 403,
      type: 'forbidden',
      title: req.__('downloads.permissionDenied'),
    });
  }

  const missing =
    (action === 'set' && !values && '/values') || (action === 'move' && !targetName && '/download');
  if (missing) {
    return problem(res, req, {
      status: 422,
      type: 'validation',
      errors: [{ pointer: missing, rule: 'required', params: {} }],
    });
  }

  let target = download;
  if (action === 'move' && targetName !== download.name) {
    target = await Download.findOne({
      where: { name: targetName, organizationId: organizationData.id },
    });
    if (!target) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('downloads.notFoundWithName', { name: targetName, organization }),
      });
    }
    if (!canWriteDownload(req, target, membership)) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('downloads.permissionDenied'),
      });
    }
  }

  const errors = [];
  let processed = 0;

  const move = async release => {
    if (target.id === download.id) {
      return null;
    }
    const taken = await DownloadRelease.findOne({
      where: { versionNumber: release.versionNumber, downloadId: target.id },
    });
    if (taken) {
      return 'conflict';
    }
    if (widerThanParent(release, target)) {
      return 'forbidden';
    }
    await release.update({ downloadId: target.id });
    const oldFilePath = getSecureDownloadPath(organization, download.name, release.versionNumber);
    const newFilePath = getSecureDownloadPath(organization, target.name, release.versionNumber);
    if (fs.existsSync(oldFilePath)) {
      renameDirectory(oldFilePath, newFilePath);
      await renameStoragePaths(
        storagePathFor(organization, download.name, release.versionNumber),
        storagePathFor(organization, target.name, release.versionNumber)
      );
    }
    return null;
  };

  const row = async versionNumber => {
    const release = await DownloadRelease.findOne({
      where: { versionNumber, downloadId: download.id },
      include: [
        {
          model: DownloadPatch,
          as: 'patches',
          include: [{ model: DownloadFile, as: 'files' }],
        },
      ],
    });
    if (!release) {
      return 'not_found';
    }
    if (action === 'delete') {
      const files = release.patches.flatMap(patch => patch.files);
      await removeDownloadFiles(files);
      await release.destroy();
      try {
        await fs.promises.rm(getSecureDownloadPath(organization, download.name, versionNumber), {
          recursive: true,
          force: true,
        });
      } catch (err) {
        log.app.info(`Could not delete the release directory: ${err}`);
      }
      return null;
    }
    if (action === 'deprecate') {
      await release.update({ deprecated: true, deprecationReason });
      return null;
    }
    if (action === 'set') {
      await release.update(releaseValues(values));
      return null;
    }
    if (action === 'move') {
      return move(release);
    }
    if (action === 'reconcile') {
      await cascadeBeneath('release', [release.id], wordsBeneath(ownWords(release), false));
      return null;
    }
    const change = VISIBILITY_CHANGES[action];
    if (widerThanParent({ ...release.get({ plain: true }), ...change }, download)) {
      return 'forbidden';
    }
    await release.update(change);
    await cascadeBeneath('release', [release.id], wordsBeneath(change, recursive === true));
    return null;
  };

  const run = async index => {
    if (index >= names.length) {
      return;
    }
    const name = names[index];
    const code = await row(name).catch(err => {
      log.error.error(`Bulk ${action} failed for download release ${name}`, err);
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
    `Bulk download release action ${action}: processed=${processed} skipped=${errors.length}`
  );
  return res.send({ processed, skipped: errors.length, errors });
};

export { bulk };
