// download.link.file.controller.js
const { loadConfig } = require('../../utils/config-loader');
const { log } = require('../../utils/Logger');
const jwt = require('jsonwebtoken');
const db = require('../../models');

let authConfig;
try {
  authConfig = loadConfig('auth');
} catch (e) {
  log.error.error(`Failed to load auth configuration: ${e.message}`);
}

let appConfig;
try {
  appConfig = loadConfig('app');
} catch (e) {
  log.error.error(`Failed to load App configuration: ${e.message}`);
}

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture/{architectureName}/file/get-download-link:
 *   post:
 *     summary: Generate a secure download link
 *     description: Generate a time-limited secure download link for a Vagrant box file
 *     tags: [Files]
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
 *         description: Box name
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Version number
 *       - in: path
 *         name: providerName
 *         required: true
 *         schema:
 *           type: string
 *         description: Provider name
 *       - in: path
 *         name: architectureName
 *         required: true
 *         schema:
 *           type: string
 *         description: Architecture name
 *     responses:
 *       200:
 *         description: Download link generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 downloadUrl:
 *                   type: string
 *                   example: "https://api.example.com/organization/myorg/box/mybox/version/1.0.0/provider/virtualbox/architecture/amd64/file/download?token=..."
 *                   description: Secure download URL with embedded token (expires in 1 hour)
 *       403:
 *         description: Unauthorized access to file
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: File, box, or organization not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 error:
 *                   type: object
 */
const getDownloadLink = async (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;

  // Get auth info from x-access-token
  let { userId } = req;
  let { isServiceAccount } = req;

  // If not set, try x-access-token
  if (!userId) {
    const token = req.headers['x-access-token'];
    if (token) {
      try {
        const decoded = jwt.verify(token, authConfig.auth.jwt.jwt_secret.value);
        userId = decoded.id;
        isServiceAccount = decoded.isServiceAccount || false;
      } catch (err) {
        log.app.warn('Invalid x-access-token:', err.message);
      }
    }
  }

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
                      include: [
                        {
                          model: db.architectures,
                          as: 'architectures',
                          where: { name: architectureName },
                        },
                      ],
                    },
                  ],
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

    const box = organizationData.users
      .flatMap(user => user.box)
      .find(foundBox => foundBox.name === boxId);

    if (!box) {
      return res.status(404).send({
        message: `Box ${boxId} not found in organization ${organization}.`,
      });
    }

    // Check authorization
    if (!box.isPublic && !isServiceAccount) {
      if (!userId) {
        return res.status(403).send({ message: 'Unauthorized access to file.' });
      }

      const user = organizationData.users.find(u => u.id === userId);
      if (!user) {
        return res.status(403).send({ message: 'Unauthorized access to file.' });
      }
    }

    // Generate a secure download token
    const downloadToken = jwt.sign(
      {
        userId,
        isServiceAccount,
        organization,
        boxId,
        versionNumber,
        providerName,
        architectureName,
      },
      authConfig.auth.jwt.jwt_secret.value,
      { expiresIn: '1h' }
    );

    // Return the secure download URL
    const downloadUrl = `${appConfig.boxvault.api_url.value}/organization/${organization}/box/${boxId}/version/${versionNumber}/provider/${providerName}/architecture/${architectureName}/file/download?token=${downloadToken}`;

    return res.status(200).json({ downloadUrl });
  } catch (err) {
    return res.status(500).send({
      message: err.message || 'Some error occurred while generating the download link.',
      error: err,
    });
  }
};

module.exports = { getDownloadLink };
