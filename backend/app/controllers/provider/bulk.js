import fs from 'fs';
import { getSecureBoxPath } from '../../utils/paths.js';
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
import {
  VISIBILITY_CHANGES,
  canWriteBox,
  cascadeBeneath,
  resolveOrgMembership,
  widerThanParent,
  wordsBeneath,
} from '../../utils/orgMembership.js';
import { problem } from '../../utils/problem.js';
const { providers: Provider, architectures: Architecture } = db;

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/bulk:
 *   post:
 *     summary: One action across a selection of providers of a version
 *     description: The box owner, or an admin or owner of the organization, may act; a service account acts inside its own organization at its effective role. Each row is isolated; a missing provider is counted as skipped and named in errors with not_found, a thrown row with internal, a visibility change that would set the provider wider than its version with forbidden. A closing verb closes every architecture and file beneath each provider as well; an opening verb reaches them only while recursive is true. A delete removes the provider's architectures and directories the way the single delete does.
 *     tags: [Providers]
 *     security:
 *       - bearerAuth: []
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
 *         description: Box name/ID
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
 *                 enum: [delete, make_public, make_private, publish, unpublish, allow_guests, deny_guests]
 *               names:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: string
 *                 description: Provider names
 *               recursive:
 *                 type: boolean
 *                 description: Carry an opening verb down to every row beneath each provider; a closing verb always goes down
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
 *         description: Organization, box or version not found
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
  const { organization, boxId, versionNumber } = req.params;
  const { action, names, recursive } = req.body;
  const { organizationData, boxData: box, versionData: version } = req;

  const membership = await resolveOrgMembership(req, organizationData.id);
  if (!canWriteBox(req, box, membership)) {
    return problem(res, req, {
      status: 403,
      type: 'forbidden',
      title: req.__('providers.delete.permissionDenied'),
    });
  }

  const errors = [];
  let processed = 0;

  const row = async providerName => {
    const provider = await Provider.findOne({
      where: { name: providerName, versionId: version.id },
    });
    if (!provider) {
      return 'not_found';
    }
    if (action !== 'delete') {
      const change = VISIBILITY_CHANGES[action];
      if (widerThanParent({ ...provider.get({ plain: true }), ...change }, version)) {
        return 'forbidden';
      }
      await provider.update(change);
      await cascadeBeneath('provider', [provider.id], wordsBeneath(change, recursive === true));
      return null;
    }
    const architectures = await Architecture.findAll({ where: { providerId: provider.id } });
    await Promise.all(
      architectures.map(async architecture => {
        try {
          await fs.promises.rm(
            getSecureBoxPath(organization, boxId, versionNumber, providerName, architecture.name),
            { recursive: true, force: true }
          );
        } catch (err) {
          log.app.info(`Could not delete the architecture directory: ${err}`);
        }
        await architecture.destroy();
      })
    );
    await provider.destroy();
    try {
      await fs.promises.rm(getSecureBoxPath(organization, boxId, versionNumber, providerName), {
        recursive: true,
        force: true,
      });
    } catch (err) {
      log.app.info(`Could not delete the provider directory: ${err}`);
    }
    return null;
  };

  const run = async index => {
    if (index >= names.length) {
      return;
    }
    const name = names[index];
    const code = await row(name).catch(err => {
      log.error.error(`Bulk ${action} failed for provider ${name}`, err);
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
  log.app.info(`Bulk provider action ${action}: processed=${processed} skipped=${errors.length}`);
  return res.send({ processed, skipped: errors.length, errors });
};

export { bulk };
