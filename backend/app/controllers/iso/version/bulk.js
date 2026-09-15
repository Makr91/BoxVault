import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import { removeUnreferencedIsoFiles } from '../helpers.js';
const { isoVersions: IsoVersion, isoFiles: IsoFile } = db;

/**
 * @swagger
 * /api/organization/{organization}/iso/{name}/version/bulk:
 *   post:
 *     summary: One action across a selection of versions of an ISO
 *     description: An admin or owner of the organization acts on every row; each row is isolated, a missing version is counted as skipped and named in errors with not_found, a thrown row with internal. A delete removes the file records the way the single delete does; a deprecate carries the required deprecation_reason as the single update does.
 *     tags: [ISOs]
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
 *         description: ISO name
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
 *                 description: Version numbers
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
 *         description: The caller does not administer the organization
 *       404:
 *         description: Organization or ISO not found
 *       422:
 *         description: A value breaks a rule of the bulkVersion form
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
const bulk = async (req, res) => {
  const { action, names, deprecation_reason: deprecationReason } = req.body;
  const { isoData: iso } = req;
  const errors = [];
  let processed = 0;

  const row = async versionNumber => {
    const version = await IsoVersion.findOne({
      where: { versionNumber, isoId: iso.id },
      include: [{ model: IsoFile, as: 'files' }],
    });
    if (!version) {
      return 'not_found';
    }
    if (action === 'delete') {
      const files = version.files.map(file => file.toJSON());
      await version.destroy();
      await removeUnreferencedIsoFiles(files);
      return null;
    }
    await version.update({ deprecated: true, deprecationReason });
    return null;
  };

  const run = async index => {
    if (index >= names.length) {
      return;
    }
    const name = names[index];
    const code = await row(name).catch(err => {
      log.error.error(`Bulk ${action} failed for ISO version ${name}`, err);
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
    `Bulk ISO version action ${action}: processed=${processed} skipped=${errors.length}`
  );
  return res.send({ processed, skipped: errors.length, errors });
};

export { bulk };
