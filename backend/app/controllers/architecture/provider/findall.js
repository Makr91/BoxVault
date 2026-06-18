// findall.js
import db from '../../../models/index.js';
const {
  architectures: Architecture,
  organization: _organization,
  box: _box,
  versions,
  providers,
  UserOrg,
} = db;

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture:
 *   get:
 *     summary: Get all architectures for a provider
 *     description: Retrieve all architectures available for a specific provider within a box version. Access depends on box visibility and user authentication.
 *     tags: [Architectures]
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
 *       - in: header
 *         name: x-access-token
 *         schema:
 *           type: string
 *         description: Optional JWT token for accessing private boxes
 *     responses:
 *       200:
 *         description: Architectures retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Architecture'
 *       403:
 *         description: Access denied - private box requires authentication
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Box, version, or provider not found
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
export const findAllByProvider = async (req, res) => {
  const { organization, boxId, versionNumber, providerName } = req.params;
  const token = req.headers['x-access-token'];
  const { userId } = req;

  try {
    const organizationData = await _organization.findOne({
      where: { name: organization },
    });

    if (!organizationData) {
      return res.status(404).send({
        message: req.__('organizations.organizationNotFoundWithName', { organization }),
      });
    }

    // Find the box by organizationId
    const box = await _box.findOne({
      where: { name: boxId, organizationId: organizationData.id },
      attributes: ['id', 'name', 'isPublic'],
      include: [
        {
          model: versions,
          as: 'versions',
          where: { versionNumber },
          include: [
            {
              model: providers,
              as: 'providers',
              where: { name: providerName },
            },
          ],
        },
      ],
    });

    if (!box) {
      return res.status(404).send({
        message: req.__('boxes.boxNotFound', { boxId }),
      });
    }

    const version = box.versions.find(v => v.versionNumber === versionNumber);
    if (!version) {
      return res.status(404).send({
        message: req.__('versions.versionNotFoundForBox', { versionNumber, boxId }),
      });
    }

    const provider = version.providers.find(p => p.name === providerName);
    if (!provider) {
      return res.status(404).send({
        message: req.__('providers.providerNotFoundInVersion', {
          providerName,
          versionNumber,
          boxId,
        }),
      });
    }

    // Check if the box is public or if the user is authenticated
    if (box.isPublic || token) {
      const architectures = await Architecture.findAll({
        where: { providerId: provider.id },
      });

      // If the box is private and authenticated, check if the user is member of the organization
      if (!box.isPublic && userId) {
        const membership = await UserOrg.findUserOrgRole(userId, organizationData.id);
        if (!membership) {
          return res.status(403).send({ message: req.__('architectures.unauthorized') });
        }
      }

      return res.send(architectures);
    }

    // If the box is private and no token is present, return unauthorized
    return res.status(403).send({ message: req.__('boxes.privateBoxAccessDenied') });
  } catch (err) {
    return res.status(500).send({ message: err.message || req.__('architectures.findAll.error') });
  }
};
