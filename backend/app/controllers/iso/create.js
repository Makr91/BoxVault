import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { conflict, refuse } from '../../utils/problem.js';
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
 *                 description: ISO name (the slug pattern of /api/rules, unique in the organization)
 *               description:
 *                 type: string
 *               published:
 *                 type: boolean
 *                 default: true
 *               is_public:
 *                 type: boolean
 *                 default: false
 *               metadata:
 *                 type: object
 *                 nullable: true
 *                 description: Structured facts pushed by the build pipeline (whitelisted top-level keys only, unknown keys stripped silently)
 *     responses:
 *       201:
 *         description: ISO created
 *       409:
 *         description: An ISO with that name already exists in the organization
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A value breaks a rule of the ISO form
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 */
const create = async (req, res) => {
  const { organization } = req.params;
  const { name, description, published, is_public: isPublic } = req.body;

  const { errors: contentErrors, fields: contentFields } = parseBoxContentFields(req.body);
  if (contentErrors.length > 0) {
    return refuse(res, req, contentErrors);
  }

  try {
    const existingIso = await ISO.findOne({
      where: { name, organizationId: req.organizationId },
    });
    if (existingIso) {
      return conflict(res, req, '/name', organization);
    }

    const iso = await ISO.create({
      name,
      description,
      published: published ?? true,
      isPublic: isPublic || false,
      organizationId: req.organizationId,
      userId: req.userId,
      metadata: contentFields.metadata ?? null,
    });

    return res.status(201).send(iso);
  } catch (err) {
    log.error.error('Error creating ISO', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

export { create };
