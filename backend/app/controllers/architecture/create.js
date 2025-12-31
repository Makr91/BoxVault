// create.js
const db = require('../../models');

const Architecture = db.architectures;
const Provider = db.providers;

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
exports.create = async (req, res) => {
  const { organization, boxId, versionNumber, providerName } = req.params;
  const { name, defaultBox } = req.body;

  try {
    const organizationData = await db.organization.findOne({
      where: { name: organization },
      include: [
        {
          model: db.user,
          as: 'users',
          include: [
            {
              model: db.box,
              as: 'box',
              where: { name: boxId },
              include: [
                {
                  model: db.versions,
                  as: 'versions',
                  where: { versionNumber },
                },
              ],
            },
          ],
        },
      ],
    });

    if (!organizationData) {
      return res.status(404).send({
        message: `Organization not found with name: ${organization}.`,
      });
    }

    // Extract the box and version from the organization data
    const box = organizationData.users.flatMap(u => u.box).find(b => b.name === boxId);

    if (!box) {
      return res.status(404).send({
        message: `Box ${boxId} not found in organization ${organization}.`,
      });
    }

    const version = box.versions.find(v => v.versionNumber === versionNumber);

    if (!version) {
      return res.status(404).send({
        message: `Version ${versionNumber} not found for box ${boxId} in organization ${organization}.`,
      });
    }

    const provider = await Provider.findOne({
      where: { name: providerName, versionId: version.id },
    });

    if (!provider) {
      return res.status(404).send({
        message: `Provider ${providerName} not found for version ${versionNumber} in box ${boxId}.`,
      });
    }

    if (defaultBox) {
      // Set all other architectures' defaultBox to false
      await Architecture.update({ defaultBox: false }, { where: { providerId: provider.id } });
    }

    const architecture = await Architecture.create({
      name,
      defaultBox: defaultBox || false,
      providerId: provider.id,
    });

    return res.send(architecture);
  } catch (err) {
    return res.status(500).send({
      message: err.message || 'Some error occurred while creating the Architecture.',
    });
  }
};
