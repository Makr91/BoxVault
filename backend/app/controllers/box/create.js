// create.js
import fs from 'fs';
import { getSecureBoxPath } from '../../utils/paths.js';
import { log } from '../../utils/Logger.js';
import { parseBoxContentFields } from './helpers.js';
import db from '../../models/index.js';
const { box: Box } = db;

/**
 * @swagger
 * /api/organization/{organization}/box:
 *   post:
 *     summary: Create a new box
 *     description: Create a new Vagrant box within an organization
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
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Box name
 *               description:
 *                 type: string
 *                 description: Box description
 *               published:
 *                 type: boolean
 *                 description: Whether the box is published
 *                 default: false
 *               isPublic:
 *                 type: boolean
 *                 description: Whether the box is publicly accessible
 *                 default: false
 *               shortDescription:
 *                 type: string
 *                 maxLength: 255
 *                 nullable: true
 *                 description: Short one-line box description
 *               readme:
 *                 type: string
 *                 nullable: true
 *                 description: Box README (markdown)
 *               metadata:
 *                 type: object
 *                 nullable: true
 *                 description: Structured box facts pushed by the build pipeline (whitelisted top-level keys only, unknown keys stripped silently)
 *     responses:
 *       200:
 *         description: Box created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Box'
 *       400:
 *         description: Bad request - name cannot be empty
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const create = async (req, res) => {
  const { organization } = req.params;
  const { name, description, published, isPublic, githubRepo, workflowFile, cicdUrl } = req.body;

  const { error: contentError, fields: contentFields } = parseBoxContentFields(req.body);
  if (contentError) {
    return res.status(400).send({ message: contentError });
  }

  try {
    const newFilePath = getSecureBoxPath(organization, name);

    // Create the new directory if it doesn't exist
    if (!fs.existsSync(newFilePath)) {
      fs.mkdirSync(newFilePath, { recursive: true });
    }

    // Create a Box
    const box = {
      name: req.body.name,
      description,
      published: published || false,
      isPublic: isPublic || false,
      userId: req.userId,
      organizationId: req.organizationId,
      githubRepo: githubRepo || null,
      workflowFile: workflowFile || null,
      cicdUrl: cicdUrl || null,
      shortDescription: contentFields.shortDescription ?? null,
      readme: contentFields.readme ?? null,
      metadata: contentFields.metadata ?? null,
    };

    // Save Box in the database
    const data = await Box.create(box);
    return res.status(201).send(data);
  } catch (err) {
    log.error.error('Error creating box:', err);
    return res.status(500).send({
      message: req.__('boxes.create.error'),
    });
  }
};
