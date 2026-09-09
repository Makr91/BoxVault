// create.js
import fs from 'fs';
import { getSecureBoxPath } from '../../utils/paths.js';
import { log } from '../../utils/Logger.js';
import { conflict, problem, refuse } from '../../utils/problem.js';
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
 *                 description: Box name (the slug pattern of /api/rules, unique in the organization)
 *               description:
 *                 type: string
 *                 description: Box description
 *               published:
 *                 type: boolean
 *                 description: Whether the box is published
 *                 default: false
 *               is_public:
 *                 type: boolean
 *                 description: Whether the box is publicly accessible
 *                 default: false
 *               github_repo:
 *                 type: string
 *                 description: GitHub repository building the box
 *               workflow_file:
 *                 type: string
 *                 description: Workflow file of the build
 *               cicd_url:
 *                 type: string
 *                 format: uri
 *                 description: Link to the build pipeline
 *               short_description:
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
 *       201:
 *         description: Box created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Box'
 *       409:
 *         description: A box with that name already exists in the organization
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A value breaks a rule of the box form
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
export const create = async (req, res) => {
  const { organization } = req.params;
  const { name, description, published, is_public, github_repo, workflow_file, cicd_url } =
    req.body;

  const { errors: contentErrors, fields: contentFields } = parseBoxContentFields(req.body);
  if (contentErrors.length > 0) {
    return refuse(res, req, contentErrors);
  }

  try {
    const existingBox = await Box.findOne({
      where: { name, organizationId: req.organizationId },
    });
    if (existingBox) {
      return conflict(res, req, '/name', organization);
    }

    const newFilePath = getSecureBoxPath(organization, name);

    // Create the new directory if it doesn't exist
    if (!fs.existsSync(newFilePath)) {
      fs.mkdirSync(newFilePath, { recursive: true });
    }

    // Create a Box
    const box = {
      name,
      description,
      published: published || false,
      isPublic: is_public || false,
      userId: req.userId,
      organizationId: req.organizationId,
      githubRepo: github_repo || null,
      workflowFile: workflow_file || null,
      cicdUrl: cicd_url || null,
      shortDescription: contentFields.shortDescription ?? null,
      readme: contentFields.readme ?? null,
      metadata: contentFields.metadata ?? null,
    };

    // Save Box in the database
    const data = await Box.create(box);
    return res.status(201).send(data);
  } catch (err) {
    log.error.error('Error creating box:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('boxes.create.error'),
    });
  }
};
