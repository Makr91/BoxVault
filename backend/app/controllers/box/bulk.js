import fs from 'fs';
import { getSecureBoxPath } from '../../utils/paths.js';
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
const { box: Box } = db;

const CHANGES = {
  make_public: { isPublic: true },
  make_private: { isPublic: false },
  publish: { published: true },
  unpublish: { published: false },
};

/**
 * @swagger
 * /api/organization/{organization}/box/bulk:
 *   post:
 *     summary: One action across a selection of boxes
 *     description: Each row is isolated and checked against the single route's permission (the box's owner, or an admin or owner of the organization); a refused row is counted as skipped and named in errors with its code (not_found, forbidden, internal).
 *     tags: [Boxes]
 *     security:
 *       - bearerAuth: []
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
 *                 enum: [delete, make_public, make_private, publish, unpublish]
 *               names:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: string
 *                 description: Box names
 *     responses:
 *       200:
 *         description: The outcome per row
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BulkResult'
 *       403:
 *         description: The caller is not a member of the organization
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: Organization not found
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A value breaks a rule of the bulkItem form
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 * components:
 *   schemas:
 *     BulkResult:
 *       type: object
 *       required: [processed, skipped, errors]
 *       properties:
 *         processed:
 *           type: integer
 *         skipped:
 *           type: integer
 *         errors:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               code:
 *                 type: string
 *                 enum: [not_found, forbidden, internal]
 */
const bulk = async (req, res) => {
  const { organization } = req.params;
  const { action, names } = req.body;
  const errors = [];
  let processed = 0;

  const row = async name => {
    const box = await Box.findOne({ where: { name, organizationId: req.organizationId } });
    if (!box) {
      return 'not_found';
    }
    const isOwner = box.userId === req.userId;
    if (!(isOwner || ['admin', 'owner'].includes(req.userOrgRole))) {
      return 'forbidden';
    }
    if (action === 'delete') {
      await Box.destroy({ where: { id: box.id } });
      try {
        await fs.promises.rm(getSecureBoxPath(organization, name), {
          recursive: true,
          force: true,
        });
      } catch (err) {
        log.app.info(`Could not delete the box directory: ${err}`);
      }
      return null;
    }
    await box.update(CHANGES[action]);
    return null;
  };

  const run = async index => {
    if (index >= names.length) {
      return;
    }
    const name = names[index];
    const code = await row(name).catch(err => {
      log.error.error(`Bulk ${action} failed for box ${name}`, err);
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
  log.app.info(`Bulk box action ${action}: processed=${processed} skipped=${errors.length}`);
  return res.send({ processed, skipped: errors.length, errors });
};

export { bulk };
