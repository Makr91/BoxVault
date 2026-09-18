import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { removeUnreferencedIsoFiles } from './helpers.js';
import { notifyIsoPublished } from './notifications.js';
const { iso: ISO, isoVersions: IsoVersion, isoFiles: IsoFile, organization: Organization } = db;

const CHANGES = {
  make_public: { isPublic: true },
  make_private: { isPublic: false },
  publish: { published: true },
  unpublish: { published: false },
  allow_guests: { guestAccess: true },
  deny_guests: { guestAccess: false },
};

/**
 * @swagger
 * /api/organization/{organization}/iso/bulk:
 *   post:
 *     summary: One action across a selection of ISOs
 *     description: Each row is isolated; an admin or owner of the organization acts on every row, a missing ISO is counted as skipped and named in errors with not_found, a thrown row with internal. A delete removes the versions and file records the way the single delete does.
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
  const { action, names } = req.body;
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
      const files = iso.versions.flatMap(version => version.files.map(file => file.toJSON()));
      await iso.destroy();
      await removeUnreferencedIsoFiles(files);
      return null;
    }
    const wasPublished = iso.published;
    const updatedIso = await iso.update(CHANGES[action]);
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
