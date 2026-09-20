import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { VISIBILITY_CHANGES, cascadeBeneath, wordsBeneath } from '../../utils/orgMembership.js';
import { removeUnreferencedIsoFiles } from './helpers.js';
import { notifyIsoPublished } from './notifications.js';
const { iso: ISO, isoVersions: IsoVersion, isoFiles: IsoFile, organization: Organization } = db;

/**
 * @swagger
 * /api/organization/{organization}/iso/bulk:
 *   post:
 *     summary: One action across a selection of ISOs
 *     description: Each row is isolated; an admin or owner of the organization acts on every row, a missing ISO is counted as skipped and named in errors with not_found, a thrown row with internal. A closing verb (make_private, unpublish, deny_guests) closes every version and file beneath each ISO as well; an opening verb reaches them only while recursive is true. A delete removes the versions and file records the way the single delete does.
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
 *                 description: ISO names
 *               recursive:
 *                 type: boolean
 *                 description: Carry an opening verb down to every row beneath each ISO; a closing verb always goes down
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
 *         description: Organization not found
 *       422:
 *         description: A value breaks a rule of the bulkItem form
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
const bulk = async (req, res) => {
  const { action, names, recursive } = req.body;
  const errors = [];
  let processed = 0;

  const row = async name => {
    const iso = await ISO.findOne({
      where: { name, organizationId: req.organizationId },
      include: [
        {
          model: IsoVersion,
          as: 'versions',
          include: [{ model: IsoFile, as: 'files' }],
        },
      ],
    });
    if (!iso) {
      return 'not_found';
    }
    if (action === 'delete') {
      const files = iso.versions.flatMap(version =>
        version.files.map(file => file.get({ plain: true }))
      );
      await iso.destroy();
      await removeUnreferencedIsoFiles(files);
      return null;
    }
    const wasPublished = iso.published;
    const change = VISIBILITY_CHANGES[action];
    const updatedIso = await iso.update(change);
    await cascadeBeneath('iso', [iso.id], wordsBeneath(change, recursive === true));
    if (updatedIso.published && !wasPublished) {
      const organizationData = await Organization.findByPk(updatedIso.organizationId);
      notifyIsoPublished(organizationData, updatedIso);
    }
    return null;
  };

  const run = async index => {
    if (index >= names.length) {
      return;
    }
    const name = names[index];
    const code = await row(name).catch(err => {
      log.error.error(`Bulk ${action} failed for ISO ${name}`, err);
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
  log.app.info(`Bulk ISO action ${action}: processed=${processed} skipped=${errors.length}`);
  return res.send({ processed, skipped: errors.length, errors });
};

export { bulk };
