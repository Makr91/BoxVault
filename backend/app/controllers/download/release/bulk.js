import fs from 'fs';
import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import { canWriteDownload, resolveOrgMembership } from '../../../utils/orgMembership.js';
import { problem } from '../../../utils/problem.js';
import { getSecureDownloadPath, removeDownloadFiles } from '../helpers.js';
const {
  downloadReleases: DownloadRelease,
  downloadPatches: DownloadPatch,
  downloadFiles: DownloadFile,
} = db;

/**
 * @swagger
 * /api/organization/{organization}/download/{name}/release/bulk:
 *   post:
 *     summary: One action across a selection of releases of a download product
 *     description: The product's owner, or an admin or owner of the organization, may act; a service account acts inside its own organization at its effective role. Each row is isolated; a missing release is counted as skipped and named in errors with not_found, a thrown row with internal. A delete removes patches, file records and the directory the way the single delete does; a deprecate carries the required deprecation_reason as the single update does.
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
 *                 enum: [delete, deprecate]
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
 *         description: Organization or product not found
 *       422:
 *         description: A value breaks a rule of the bulkVersion form
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
const bulk = async (req, res) => {
  const { organization } = req.params;
  const { action, names, deprecation_reason: deprecationReason } = req.body;
  const { organizationData, downloadData: download } = req;

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
    await release.update({ deprecated: true, deprecationReason });
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
