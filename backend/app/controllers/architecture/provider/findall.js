// findall.js
const db = require('../../../models');

const Architecture = db.architectures;

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
exports.findAllByProvider = async (req, res) => {
  const { organization, boxId, versionNumber, providerName } = req.params;
  const token = req.headers['x-access-token'];
  const userId = null;

  try {
    const organizationData = await db.organization.findOne({
      where: { name: organization },
    });

    if (!organizationData) {
      return res.status(404).send({
        message: `Organization not found with name: ${organization}.`,
      });
    }

    // Find the box by organizationId
    const box = await db.box.findOne({
      where: { name: boxId, organizationId: organizationData.id },
      attributes: ['id', 'name', 'isPublic'],
      include: [
        {
          model: db.versions,
          as: 'versions',
          where: { versionNumber },
          include: [
            {
              model: db.providers,
              as: 'providers',
              where: { name: providerName },
            },
          ],
        },
      ],
    });

    if (!box) {
      return res.status(404).send({
        message: `Box ${boxId} not found.`,
      });
    }

    const version = box.versions.find(v => v.versionNumber === versionNumber);
    if (!version) {
      return res.status(404).send({
        message: `Version ${versionNumber} not found for box ${boxId}.`,
      });
    }

    const provider = version.providers.find(p => p.name === providerName);
    if (!provider) {
      return res.status(404).send({
        message: `Provider ${providerName} not found for version ${versionNumber} in box ${boxId}.`,
      });
    }

    // Check if the box is public or if the user is authenticated
    if (box.isPublic || token) {
      const architectures = await Architecture.findAll({
        where: { providerId: provider.id },
      });

      // If the box is private and authenticated, check if the user is member of the organization
      if (!box.isPublic && userId) {
        const membership = await db.UserOrg.findUserOrgRole(userId, organizationData.id);
        if (!membership) {
          return res.status(403).send({ message: 'Unauthorized access to architecture.' });
        }
      }

      return res.send(architectures);
    }

    // If the box is private and no token is present, return unauthorized
    return res.status(403).send({ message: 'Access denied. Private box requires authentication.' });
  } catch (err) {
    return res
      .status(500)
      .send({ message: err.message || 'Some error occurred while retrieving architectures.' });
  }
};
