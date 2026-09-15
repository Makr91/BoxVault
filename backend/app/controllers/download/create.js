import fs from 'fs';
import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { conflict, problem } from '../../utils/problem.js';
import { getSecureDownloadPath } from './helpers.js';
const { download: Download } = db;

/**
 * @swagger
 * /api/organization/{organization}/download:
 *   post:
 *     summary: Create a download product
 *     description: Create a new download product within an organization. Any member of the organization may create one; releases, patches and files are added afterwards through their routes or by the upload route.
 *     tags: [Downloads]
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
 *                 description: Product name (the slug pattern of /api/rules, unique in the organization)
 *               description:
 *                 type: string
 *               published:
 *                 type: boolean
 *                 default: false
 *               is_public:
 *                 type: boolean
 *                 default: false
 *               family:
 *                 type: string
 *                 description: Product family (HCL Domino, Fortinet)
 *               vendor:
 *                 type: string
 *               docs_url:
 *                 type: string
 *                 format: uri
 *               notes_url:
 *                 type: string
 *                 format: uri
 *               icon_url:
 *                 type: string
 *                 format: uri
 *                 description: The product's icon, drawn before its title; the vendor's mark when absent
 *     responses:
 *       201:
 *         description: Download created
 *       409:
 *         description: A download with that name already exists in the organization
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A value breaks a rule of the download form
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 */
const create = async (req, res) => {
  const { organization } = req.params;
  const {
    name,
    description,
    published,
    is_public: isPublic,
    family,
    vendor,
    docs_url: docsUrl,
    notes_url: notesUrl,
    icon_url: iconUrl,
  } = req.body;

  try {
    const existingDownload = await Download.findOne({
      where: { name, organizationId: req.organizationId },
    });
    if (existingDownload) {
      return conflict(res, req, '/name', organization);
    }

    const newFilePath = getSecureDownloadPath(organization, name);
    if (!fs.existsSync(newFilePath)) {
      fs.mkdirSync(newFilePath, { recursive: true });
    }

    const download = await Download.create({
      name,
      description,
      published: published || false,
      isPublic: isPublic || false,
      family: family || null,
      vendor: vendor || null,
      docsUrl: docsUrl || null,
      notesUrl: notesUrl || null,
      iconUrl: iconUrl || null,
      userId: req.userId,
      organizationId: req.organizationId,
    });

    return res.status(201).send(download);
  } catch (err) {
    log.error.error('Error creating download', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { create };
