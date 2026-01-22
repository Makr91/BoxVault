// download.link.file.controller.js
import { loadConfig } from '../../utils/config-loader.js';
import db from '../../models/index.js';
const { UserOrg } = db;
import { generateDownloadToken } from '../../utils/auth.js';

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
  const { userId } = req;
  const { isServiceAccount } = req;

  // req.userId and req.isServiceAccount are set by sessionAuth middleware
  // No need to manually check here as the middleware handles it

  try {
    const appConfig = loadConfig('app');
    const authConfig = loadConfig('auth');

    // Entities are pre-loaded by verifyBoxFilePath middleware
    const { organization: organizationData, box } = req.entities;

    // Check authorization
    if (!box.isPublic && !isServiceAccount) {
      if (!userId) {
        return res.status(403).send({ message: req.__('files.unauthorized') });
      }

      const membership = await UserOrg.findUserOrgRole(userId, organizationData.id);
      if (!membership) {
        return res.status(403).send({ message: req.__('files.unauthorized') });
      }
    }

    // Generate a secure download token with configurable expiry
    const downloadLinkExpiry = authConfig.auth?.jwt?.download_link_expiry?.value || '1h';
    const downloadToken = generateDownloadToken(
      {
        userId,
        isServiceAccount,
        organization,
        boxId,
        versionNumber,
        providerName,
        architectureName,
      },
      downloadLinkExpiry
    );

    // Return the secure download URL
    const downloadUrl = `${appConfig.boxvault.api_url.value}/organization/${organization}/box/${boxId}/version/${versionNumber}/provider/${providerName}/architecture/${architectureName}/file/download?token=${downloadToken}`;

    return res.status(200).json({ downloadUrl });
  } catch (err) {
    return res.status(500).send({
      message: err.message || req.__('files.link.error'),
      error: err,
    });
  }
};

export { getDownloadLink };
