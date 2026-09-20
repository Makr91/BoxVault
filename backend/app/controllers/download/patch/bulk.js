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
import { getSecureDownloadPath, removeDownloadFiles } from '../helpers.js';
const { downloadPatches: DownloadPatch, downloadFiles: DownloadFile } = db;

/**
 * @swagger
 * /api/organization/{organization}/download/{name}/release/{versionNumber}/patch/bulk:
 *   post:
 *     summary: One action across a selection of patches of a release
 *     description: The product's owner, or an admin or owner of the organization, may act; a service account acts inside its own organization at its effective role. Each row is isolated; a missing patch is counted as skipped and named in errors with not_found, a thrown row with internal, a visibility change that would set the patch wider than its release with forbidden. A closing verb closes every file beneath each patch as well; an opening verb reaches them only while recursive is true. A delete removes the file records and the directory the way the single delete does, a shared file handing its bytes to one of its links first.
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
 *                 enum: [delete, make_public, make_private, publish, unpublish, allow_guests, deny_guests]
 *               names:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: string
 *                 description: Patch names
 *               recursive:
 *                 type: boolean
 *                 description: Carry an opening verb down to every file beneath each patch; a closing verb always goes down
 *     responses:
 *       200:
 *         description: The outcome per row
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BulkResult'
 *       403:
 *         description: The caller may not write the product
 *       404:
 *         description: Organization, product or release not found
 *       422:
 *         description: A value breaks a rule of the bulkPatch form
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
const bulk = async (req, res) => {
  const { organization } = req.params;
  const { action, names, recursive } = req.body;
  const { organizationData, downloadData: download, releaseData: release } = req;

  const membership = await resolveOrgMembership(req, organizationData.id);
  if (!canWriteDownload(req, download, membership)) {
    return problem(res, req, {
      status: 403,
      type: 'forbidden',
      title: req.__('downloads.permissionDenied'),
    });
  }

  const errors = [];
  let processed = 0;

  const row = async patchName => {
    const patch = await DownloadPatch.findOne({
      where: { name: patchName, downloadReleaseId: release.id },
    });
    if (!patch) {
      return 'not_found';
    }
    if (action !== 'delete') {
      const change = VISIBILITY_CHANGES[action];
      if (widerThanParent({ ...patch.get({ plain: true }), ...change }, release)) {
        return 'forbidden';
      }
      await patch.update(change);
      await cascadeBeneath('patch', [patch.id], wordsBeneath(change, recursive === true));
      return null;
    }
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
