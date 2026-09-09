// create.js
import { log } from '../../utils/Logger.js';
import { conflict, problem } from '../../utils/problem.js';
import db from '../../models/index.js';
import { canWriteBox, resolveOrgMembership } from '../../utils/orgMembership.js';
const { architectures: Architecture } = db;

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture:
 *   post:
 *     summary: Create a new architecture for a provider
 *     description: Create a new architecture (e.g., amd64, arm64) for a specific provider within a box version. The box owner, or an admin or owner of the organization, may create; a service account acts inside its own organization at its effective role.
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
 *         example: myorg
 *       - in: path
 *         name: boxId
 *         required: true
 *         schema:
 *           type: string
 *         description: Box name
 *         example: ubuntu-server
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Version number
 *         example: "1.0.0"
 *       - in: path
 *         name: providerName
 *         required: true
 *         schema:
 *           type: string
 *         description: Provider name
 *         example: virtualbox
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
 *                 description: Architecture name (the identifier pattern of /api/rules, unique in the provider)
 *                 example: amd64
 *               description:
 *                 type: string
 *                 description: Architecture description
 *               default_box:
 *                 type: boolean
 *                 description: Whether this should be the default architecture for the provider
 *                 example: true
 *               checksum_type:
 *                 type: string
 *                 enum: [NULL, MD5, SHA1, SHA256, SHA384, SHA512]
 *                 description: Checksum type of the file uploaded afterwards
 *               checksum:
 *                 type: string
 *                 description: Hex checksum of the file uploaded afterwards
 *     responses:
 *       201:
 *         description: Architecture created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Architecture'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: Organization, box, version, or provider not found
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       409:
 *         description: An architecture with that name already exists for the provider
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A value breaks a rule of the architecture form
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
  const { name, description, default_box: defaultBox } = req.body;

  try {
    const { organizationData, boxData: box, providerData: provider } = req;

    // Check if user owns the box OR has admin/owner role
    const membership = await resolveOrgMembership(req, organizationData.id);
    const canCreate = canWriteBox(req, box, membership);

    if (!canCreate) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('architectures.create.permissionDenied'),
      });
    }

    const existingArchitecture = await Architecture.findOne({
      where: { name, providerId: provider.id },
    });
    if (existingArchitecture) {
      return conflict(res, req, '/name', provider.name);
    }

    if (defaultBox) {
      // Set all other architectures' defaultBox to false
      await Architecture.update({ defaultBox: false }, { where: { providerId: provider.id } });
    }

    const architecture = await Architecture.create({
      name,
      description,
      defaultBox: defaultBox || false,
      providerId: provider.id,
    });

    return res.status(201).send(architecture);
  } catch (err) {
    log.error.error('Error creating architecture:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('architectures.create.error'),
    });
  }
};
