import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import { problem } from '../../../utils/problem.js';
import { removeUnreferencedIsoFiles } from '../helpers.js';
const { isoVersions: IsoVersion, isoFiles: IsoFile, sequelize } = db;

/**
 * @swagger
 * /api/organization/{organization}/iso/{name}/version/{versionNumber}/architecture/bulk:
 *   post:
 *     summary: One action across a selection of architectures of an ISO version
 *     description: An admin or owner of the organization acts on every row; each row is one architecture's file record, deleted in a transaction and its physical file removed only when no other record shares its storage path, the way the single delete does. A missing architecture is counted as skipped and named in errors with not_found, a thrown row with internal.
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
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Version number
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
 *                 enum: [delete]
 *               names:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: string
 *                 description: Architectures
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
 *         description: Organization, ISO or version not found
 *       422:
 *         description: A value breaks a rule of the bulkLeaf form
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
const bulk = async (req, res) => {
  const { versionNumber } = req.params;
  const { action, names } = req.body;
  const { isoData: iso } = req;

  const version = await IsoVersion.findOne({ where: { versionNumber, isoId: iso.id } });
  if (!version) {
    return problem(res, req, {
      status: 404,
      type: 'not-found',
      title: req.__('isos.versions.notFound'),
    });
  }

  const errors = [];
  let processed = 0;

  const row = async architecture => {
    const fileRecord = await IsoFile.findOne({
      where: { isoVersionId: version.id, architecture },
    });
    if (!fileRecord) {
      return 'not_found';
    }
    const removed = fileRecord.get({ plain: true });
    const transaction = await sequelize.transaction();
    try {
      await fileRecord.destroy({ transaction });
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
    await removeUnreferencedIsoFiles([removed]);
    return null;
  };

  const run = async index => {
    if (index >= names.length) {
      return;
    }
    const name = names[index];
    const code = await row(name).catch(err => {
      log.error.error(`Bulk ${action} failed for ISO architecture ${name}`, err);
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
    `Bulk ISO architecture action ${action}: processed=${processed} skipped=${errors.length}`
  );
  return res.send({ processed, skipped: errors.length, errors });
};

export { bulk };
