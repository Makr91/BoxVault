import fs from 'fs';
import { getSecureBoxPath } from '../../utils/paths.js';
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
import {
  VISIBILITY_CHANGES,
  canWriteBox,
  resolveOrgMembership,
  widerThanParent,
} from '../../utils/orgMembership.js';
import { problem } from '../../utils/problem.js';
import { notifyVersionDeprecated } from './notifications.js';
const { versions: Version } = db;

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/bulk:
 *   post:
 *     summary: One action across a selection of versions of a box
 *     description: The box owner, or an admin or owner of the organization, may act; a service account acts inside its own organization at its effective role. Each row is isolated; a missing version is counted as skipped and named in errors with not_found, a thrown row with internal, a visibility change that would set the version wider than its box with forbidden. A deprecate carries the required deprecation_reason as the single update does.
 *     tags: [Versions]
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
 *                 enum: [delete, deprecate, make_public, make_private, publish, unpublish, allow_guests, deny_guests]
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
 *         description: The caller may not write the box
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: Organization or box not found
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A value breaks a rule of the bulkVersion form
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
const bulk = async (req, res) => {
  const { organization, boxId } = req.params;
  const { action, names, deprecation_reason: deprecationReason } = req.body;
  const { organizationData, boxData: box } = req;

  const membership = await resolveOrgMembership(req, organizationData.id);
  if (!canWriteBox(req, box, membership)) {
    return problem(res, req, {
      status: 403,
      type: 'forbidden',
      title: req.__('versions.delete.permissionDenied'),
    });
  }

  const errors = [];
  let processed = 0;

  const row = async versionNumber => {
    const version = await Version.findOne({ where: { versionNumber, boxId: box.id } });
    if (!version) {
      return 'not_found';
    }
    if (action === 'delete') {
      await Version.destroy({ where: { id: version.id } });
      try {
        await fs.promises.rm(getSecureBoxPath(organization, boxId, versionNumber), {
          recursive: true,
          force: true,
        });
      } catch (err) {
        log.app.info(`Could not delete the version directory: ${err}`);
      }
      return null;
    }
    if (action !== 'deprecate') {
      const change = VISIBILITY_CHANGES[action];
      if (widerThanParent({ ...version.get({ plain: true }), ...change }, box)) {
        return 'forbidden';
      }
      await version.update(change);
      return null;
    }
    const becomesDeprecated = !version.deprecated;
    const updatedVersion = await version.update({ deprecated: true, deprecationReason });
    if (becomesDeprecated) {
      notifyVersionDeprecated(
        organizationData,
        box.name,
        updatedVersion.versionNumber,
        updatedVersion.deprecationReason
      );
    }
    return null;
  };

  const run = async index => {
    if (index >= names.length) {
      return;
    }
    const name = names[index];
    const code = await row(name).catch(err => {
      log.error.error(`Bulk ${action} failed for version ${name}`, err);
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
  log.app.info(`Bulk version action ${action}: processed=${processed} skipped=${errors.length}`);
  return res.send({ processed, skipped: errors.length, errors });
};

export { bulk };
