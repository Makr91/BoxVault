// create.js
import db from '../../models/index.js';
const {
  architectures: Architecture,
  providers: Provider,
  organization: _organization,
  box: _box,
  UserOrg,
  versions,
} = db;

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture:
 *   post:
 *     summary: Create a new architecture for a provider
 *     description: Create a new architecture (e.g., amd64, arm64) for a specific provider within a box version
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
 *                 description: Architecture name
 *                 example: amd64
 *               defaultBox:
 *                 type: boolean
 *                 description: Whether this should be the default architecture for the provider
 *                 example: true
 *     responses:
 *       200:
 *         description: Architecture created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Architecture'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Organization, box, version, or provider not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const create = async (req, res) => {
  const { organization, boxId, versionNumber, providerName } = req.params;
  const { name, description, defaultBox } = req.body;

  try {
    // Get entities for permission check and provider ID
    const organizationData = await _organization.findOne({
      where: { name: organization },
    });

    const box = await _box.findOne({
      where: { name: boxId, organizationId: organizationData.id },
    });

    // Check if user owns the box OR has moderator/admin role
    const membership = await UserOrg.findUserOrgRole(req.userId, organizationData.id);
    const isOwner = box.userId === req.userId;
    const canCreate = isOwner || (membership && ['moderator', 'admin'].includes(membership.role));

    if (!canCreate) {
      return res.status(403).send({
        message: req.__('architectures.create.permissionDenied'),
      });
    }

    // Get version and provider (already validated by middleware)
    const version = await versions.findOne({
      where: { versionNumber, boxId: box.id },
    });

    const provider = await Provider.findOne({
      where: { name: providerName, versionId: version.id },
    });

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
    return res.status(500).send({
      message: err.message || req.__('architectures.create.error'),
    });
  }
};
