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
import {
  getSecureDownloadPath,
  ownWords,
  relocatePatch,
  removeDownloadFiles,
  resolveTarget,
} from '../helpers.js';
const { downloadPatches: DownloadPatch, downloadFiles: DownloadFile } = db;

const MISSING_TITLES = {
  download: 'downloads.notFound',
  release: 'downloads.releases.notFound',
};

/**
 * The columns a `set` writes on a patch, present values only.
 * @param {Object} values - The body's values member
 * @returns {Object} The model-named payload
 */
const patchValues = values => {
  const payload = {};
  if (typeof values.kind !== 'undefined') {
    payload.kind = values.kind;
  }
  if (typeof values.description !== 'undefined') {
    payload.description = values.description;
  }
  if (typeof values.released_at !== 'undefined') {
    payload.releasedAt = values.released_at;
  }
  if (typeof values.notes_url !== 'undefined') {
    payload.notesUrl = values.notes_url === '' ? null : values.notes_url;
  }
  return payload;
};

/**
 * @swagger
 * /api/organization/{organization}/download/{name}/release/{versionNumber}/patch/bulk:
 *   post:
 *     summary: One action across a selection of patches of a release
 *     description: The product's owner, or an admin or owner of the organization, may act; a service account acts inside its own organization at its effective role. Each row is isolated; a missing patch is counted as skipped and named in errors with not_found, a thrown row with internal, a visibility change that would set the patch wider than its release with forbidden. A closing verb closes every file beneath each patch as well; an opening verb reaches them only while recursive is true. `set` writes the given values (kind, description, released_at, notes_url) on every named patch. `move` moves every named patch, with its files and directory, to the release `download` and `release` name (each defaulting to the current one), the caller having to be allowed to write both products, a patch whose name is taken there counted as conflict and one wider than the target release as forbidden. `reconcile` carries every word a patch holds off down to its files. A delete removes the file records and the directory the way the single delete does, a shared file handing its bytes to one of its links first.
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
 *                 enum: [delete, set, move, reconcile, make_public, make_private, publish, unpublish, allow_guests, deny_guests]
 *               names:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: string
 *                 description: Patch names
 *               recursive:
 *                 type: boolean
 *                 description: Carry an opening verb down to every file beneath each patch; a closing verb always goes down
 *               download:
 *                 type: string
 *                 description: The product the patches move to; the current one when absent
 *               release:
 *                 type: string
 *                 description: The release the patches move to; the current identifier when absent
 *               values:
 *                 type: object
 *                 description: Required while action is set
 *                 properties:
 *                   kind:
 *                     type: string
 *                     enum: [release, fixpack, interim-fix, hotfix]
 *                   description:
 *                     type: string
 *                   released_at:
 *                     type: string
 *                     format: date
 *                   notes_url:
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
 *         description: The caller may not write the product, or the target product
 *       404:
 *         description: Organization, product, release or target not found
 *       422:
 *         description: A value breaks a rule of the bulkPatch form
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
const bulk = async (req, res) => {
  const { organization } = req.params;
  const { action, names, recursive, values } = req.body;
  const { organizationData, downloadData: download, releaseData: release } = req;

  const membership = await resolveOrgMembership(req, organizationData.id);
  if (!canWriteDownload(req, download, membership)) {
    return problem(res, req, {
      status: 403,
      type: 'forbidden',
      title: req.__('downloads.permissionDenied'),
    });
  }

  if (action === 'set' && !values) {
    return problem(res, req, {
      status: 422,
      type: 'validation',
      errors: [{ pointer: '/values', rule: 'required', params: {} }],
    });
  }

  let target = { download, release };
  if (action === 'move') {
    target = await resolveTarget(
      { organizationId: organizationData.id, download, release },
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

  const move = async patch => {
    if (target.release.id === release.id) {
      return null;
    }
    const taken = await DownloadPatch.findOne({
      where: { name: patch.name, downloadReleaseId: target.release.id },
    });
    if (taken) {
      return 'conflict';
    }
    if (widerThanParent(patch, target.release)) {
      return 'forbidden';
    }
    await relocatePatch(organization, patch, { download, release }, target);
    return null;
  };

  const row = async patchName => {
    const patch = await DownloadPatch.findOne({
      where: { name: patchName, downloadReleaseId: release.id },
    });
    if (!patch) {
      return 'not_found';
    }
    if (action === 'delete') {
      const files = await DownloadFile.findAll({ where: { downloadPatchId: patch.id } });
      await removeDownloadFiles(files);
      await patch.destroy();
      try {
        await fs.promises.rm(
          getSecureDownloadPath(organization, download.name, release.versionNumber, patchName),
          { recursive: true, force: true }
        );
      } catch (err) {
        log.app.info(`Could not delete the patch directory: ${err}`);
      }
      return null;
    }
    if (action === 'set') {
      await patch.update(patchValues(values));
      return null;
    }
    if (action === 'move') {
      return move(patch);
    }
    if (action === 'reconcile') {
      await cascadeBeneath('patch', [patch.id], wordsBeneath(ownWords(patch), false));
      return null;
    }
    const change = VISIBILITY_CHANGES[action];
    if (widerThanParent({ ...patch.get({ plain: true }), ...change }, release)) {
      return 'forbidden';
    }
    await patch.update(change);
    await cascadeBeneath('patch', [patch.id], wordsBeneath(change, recursive === true));
    return null;
  };

  const run = async index => {
    if (index >= names.length) {
      return;
    }
    const name = names[index];
    const code = await row(name).catch(err => {
      log.error.error(`Bulk ${action} failed for download patch ${name}`, err);
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
    `Bulk download patch action ${action}: processed=${processed} skipped=${errors.length}`
  );
  return res.send({ processed, skipped: errors.length, errors });
};

export { bulk };
