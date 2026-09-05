import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { parseBoxContentFields } from '../box/helpers.js';
const { iso: ISO } = db;

/**
 * @swagger
 * /api/organization/{organization}/iso:
 *   post:
 *     summary: Create an ISO
 *     description: Create a new ISO within an organization. Versions and files are added afterwards through the version and file routes.
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
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: ISO name (letters, digits, dash and period)
 *               description:
 *                 type: string
 *               published:
 *                 type: boolean
 *                 default: true
 *               isPublic:
 *                 type: boolean
 *                 default: false
 *               metadata:
 *                 type: object
 *                 nullable: true
 *                 description: Structured facts pushed by the build pipeline (whitelisted top-level keys only, unknown keys stripped silently)
 *     responses:
 *       201:
 *         description: ISO created
 *       400:
 *         description: Invalid name or metadata
 *       409:
 *         description: An ISO with that name already exists in the organization
 *       500:
 *         description: Internal server error
 */
const create = async (req, res) => {
  const { name, description, published, isPublic } = req.body;

  const { error: contentError, fields: contentFields } = parseBoxContentFields(req.body);
  if (contentError) {
    return res.status(400).send({ message: contentError });
  }

  try {
    const iso = await ISO.create({
      name,
      description,
      published: published ?? true,
      isPublic: isPublic || false,
      organizationId: req.organizationId,
      metadata: contentFields.metadata ?? null,
    });

    return res.status(201).send(iso);
  } catch (err) {
    log.error.error('Error creating ISO', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

export { create };
