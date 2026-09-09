/**
 * @swagger
 * components:
 *   schemas:
 *     Provider:
 *       type: object
 *       required:
 *         - name
 *         - versionId
 *       properties:
 *         id:
 *           type: integer
 *           description: The auto-generated id of the provider
 *         name:
 *           type: string
 *           description: The provider name (e.g., virtualbox, vmware)
 *         description:
 *           type: string
 *           description: Description of the provider
 *         versionId:
 *           type: integer
 *           description: ID of the version this provider belongs to
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Provider creation timestamp
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Provider last update timestamp
 *       example:
 *         id: 1
 *         name: "virtualbox"
 *         description: "VirtualBox provider"
 *         versionId: 1
 *         createdAt: "2023-01-01T00:00:00.000Z"
 *         updatedAt: "2023-01-01T00:00:00.000Z"
 *
 *     CreateProviderRequest:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         name:
 *           type: string
 *           description: The provider name (the identifier pattern of /api/rules, unique in the version)
 *         description:
 *           type: string
 *           description: Description of the provider
 *       example:
 *         name: "virtualbox"
 *         description: "VirtualBox provider"
 *
 *     UpdateProviderRequest:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           description: The new provider name (the identifier pattern of /api/rules, unique in the version)
 *         description:
 *           type: string
 *           description: Updated description of the provider
 *       example:
 *         name: "virtualbox"
 *         description: "Updated VirtualBox provider"
 */

// create.js
import fs from 'fs';
import { getSecureBoxPath } from '../../utils/paths.js';
import { log } from '../../utils/Logger.js';
import { conflict, problem } from '../../utils/problem.js';
import db from '../../models/index.js';
import { canWriteBox, resolveOrgMembership } from '../../utils/orgMembership.js';
const { providers: Provider } = db;
/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider:
 *   post:
 *     summary: Create a new provider for a version
 *     description: The box owner, or an admin or owner of the organization, may create a provider; a service account acts inside its own organization at its effective role.
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
 *             $ref: '#/components/schemas/CreateProviderRequest'
 *     responses:
 *       201:
 *         description: Provider created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Provider'
 *       403:
 *         description: The caller may not write the box
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: Organization, box, or version not found
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       409:
 *         description: A provider with that name already exists for the version
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A value breaks a rule of the provider form
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
  const { organization, boxId, versionNumber } = req.params;
  const { name, description } = req.body;
  const newFilePath = getSecureBoxPath(organization, boxId, versionNumber, name);

  try {
    const { organizationData, boxData: box, versionData: version } = req;

    // Check if user owns the box OR has admin/owner role
    const membership = await resolveOrgMembership(req, organizationData.id);
    const canCreate = canWriteBox(req, box, membership);

    if (!canCreate) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('providers.create.permissionDenied'),
      });
    }

    const existingProvider = await Provider.findOne({
      where: { name, versionId: version.id },
    });
    if (existingProvider) {
      return conflict(res, req, '/name', version.versionNumber);
    }

    // Create the new directory if it doesn't exist
    if (!fs.existsSync(newFilePath)) {
      fs.mkdirSync(newFilePath, { recursive: true });
    }

    // Create the provider
    const provider = await Provider.create({
      name,
      description,
      versionId: version.id,
    });

    return res.status(201).send(provider);
  } catch (err) {
    log.error.error('Error creating provider:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('providers.create.error'),
    });
  }
};
