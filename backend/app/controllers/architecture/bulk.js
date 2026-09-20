import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
import {
  VISIBILITY_CHANGES,
  canWriteBox,
  resolveOrgMembership,
  widerThanParent,
} from '../../utils/orgMembership.js';
import { problem } from '../../utils/problem.js';
const { architectures: Architecture } = db;

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture/bulk:
 *   post:
 *     summary: One action across a selection of architectures of a provider
 *     description: The box owner, or an admin or owner of the organization, may act; a service account acts inside its own organization at its effective role. Each row is isolated; a missing architecture is counted as skipped and named in errors with not_found, a thrown row with internal, a visibility change that would set the architecture wider than its provider with forbidden.
 *     tags: [Architectures]
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
 *         name: boxId
 *         required: true
 *         schema:
 *           type: string
 *         description: Box name
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Version number
 *       - in: path
 *         name: providerName
 *         required: true
 *         schema:
 *           type: string
 *         description: Provider name
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
 *                 description: Architecture names
 *     responses:
 *       200:
 *         description: The outcome per row
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BulkResult'
 *       403:
 *         description: The caller may not write the box
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: Organization, box, version or provider not found
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A value breaks a rule of the bulkLeaf form
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
const bulk = async (req, res) => {
  const { action, names } = req.body;
  const { organizationData, boxData: box, providerData: provider } = req;

  const membership = await resolveOrgMembership(req, organizationData.id);
  if (!canWriteBox(req, box, membership)) {
    return problem(res, req, {
      status: 403,
      type: 'forbidden',
      title: req.__('architectures.delete.permissionDenied'),
    });
  }

  const errors = [];
  let processed = 0;

  const row = async architectureName => {
    if (action === 'delete') {
      const deleted = await Architecture.destroy({
        where: { name: architectureName, providerId: provider.id },
      });
      return deleted ? null : 'not_found';
    }
    const architecture = await Architecture.findOne({
      where: { name: architectureName, providerId: provider.id },
    });
    if (!architecture) {
      return 'not_found';
    }
    const change = VISIBILITY_CHANGES[action];
    if (widerThanParent({ ...architecture.get({ plain: true }), ...change }, provider)) {
      return 'forbidden';
    }
    await architecture.update(change);
    return null;
  };

  const run = async index => {
    if (index >= names.length) {
      return;
    }
    const name = names[index];
    const code = await row(name).catch(err => {
      log.error.error(`Bulk ${action} failed for architecture ${name}`, err);
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
    `Bulk architecture action ${action}: processed=${processed} skipped=${errors.length}`
  );
  return res.send({ processed, skipped: errors.length, errors });
};

export { bulk };
