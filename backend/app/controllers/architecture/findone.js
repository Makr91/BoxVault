// findone.js
import db from '../../models/index.js';
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
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture/{architectureName}:
 *   get:
 *     summary: Get a specific architecture
 *     description: Retrieve details of a specific architecture. Requires authentication and appropriate access permissions.
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
 *       - in: path
 *         name: architectureName
 *         required: true
 *         schema:
 *           type: string
 *         description: Architecture name
 *         example: amd64
 *       - in: header
 *         name: x-access-token
 *         required: true
 *         schema:
 *           type: string
 *         description: JWT authentication token
 *     responses:
 *       200:
 *         description: Architecture retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Architecture'
 *       401:
 *         description: Invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: No token provided or unauthorized access
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Box, version, provider, or architecture not found
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
export const findOne = async (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;

  // req.userId and req.isServiceAccount are set by sessionAuth middleware or vagrantHandler

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

    // If the box is public or it's a service account, allow access
    if (box.isPublic || req.isServiceAccount) {
      const architecture = await Architecture.findOne({
        where: { name: architectureName, providerId: provider.id },
      });
      if (!architecture) {
        return res.status(404).send({ message: req.__('architectures.notFound') });
      }
      return res.send(architecture);
    }

    // If the box is private and it's not a service account, check if the user is member of the organization
    const membership = await UserOrg.findUserOrgRole(req.userId, organizationData.id);
    if (!membership) {
      return res.status(403).send({ message: req.__('architectures.unauthorized') });
    }

    // If the user belongs to the organization, allow access
    const architecture = await Architecture.findOne({
      where: { name: architectureName, providerId: provider.id },
    });
    if (!architecture) {
      return res.status(404).send({ message: req.__('architectures.notFound') });
    }
    return res.send(architecture);
  } catch (err) {
    return res.status(500).send({ message: err.message || req.__('architectures.findOne.error') });
  }
};
