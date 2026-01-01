// update.js
const fs = require('fs');
const { getSecureBoxPath } = require('../../utils/paths');
const db = require('../../models');
const { safeRmdirSync } = require('../../utils/fsHelper');

const Architecture = db.architectures;
const Provider = db.providers;

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture/{architectureName}:
 *   put:
 *     summary: Update an architecture by name
 *     description: Update an architecture's properties including name and default status. Also handles file system directory renaming when architecture name changes.
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
 *         description: Current architecture name to update
 *         example: amd64
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: New architecture name
 *                 example: arm64
 *               defaultBox:
 *                 type: boolean
 *                 description: Whether this should be the default architecture for the provider
 *                 example: true
 *     responses:
 *       200:
 *         description: Architecture updated successfully
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
 *         description: Organization, box, version, provider, or architecture not found
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
exports.update = async (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
  const { name, defaultBox } = req.body;

  const oldFilePath = getSecureBoxPath(
    organization,
    boxId,
    versionNumber,
    providerName,
    architectureName
  );
  const newFilePath = getSecureBoxPath(organization, boxId, versionNumber, providerName, name);

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

    // Create the new directory if it doesn't exist
    if (!fs.existsSync(newFilePath)) {
      fs.mkdirSync(newFilePath, { recursive: true });
    }

    // Rename the directory if necessary
    if (oldFilePath !== newFilePath) {
      fs.renameSync(oldFilePath, newFilePath);

      // Clean up the old directory if it still exists
      safeRmdirSync(oldFilePath, { recursive: true });
    }

    const [updated] = await Architecture.update(
      { name, defaultBox },
      { where: { name: architectureName, providerId: provider.id } }
    );

    if (updated) {
      const updatedArchitecture = await Architecture.findOne({
        where: { name, providerId: provider.id },
      });
      return res.send(updatedArchitecture);
    }

    throw new Error('Architecture not found');
  } catch (err) {
    return res.status(500).send({
      message: err.message || 'Some error occurred while updating the Architecture.',
    });
  }
};
