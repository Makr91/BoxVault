// download.js
const { log } = require('../../utils/Logger');
const db = require('../../models');

const Organization = db.organization;
const Box = db.box;

/**
 * @swagger
 * /{organization}/boxes/{name}/versions/{version}/providers/{provider}/{architecture}/vagrant.box:
 *   get:
 *     summary: Download Vagrant box file
 *     description: Download the actual Vagrant box file. This endpoint is used by Vagrant CLI and handles authentication for private boxes.
 *     tags: [Boxes]
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Box name
 *       - in: path
 *         name: version
 *         required: true
 *         schema:
 *           type: string
 *         description: Box version
 *       - in: path
 *         name: provider
 *         required: true
 *         schema:
 *           type: string
 *         description: Provider name (e.g., virtualbox, vmware)
 *       - in: path
 *         name: architecture
 *         required: true
 *         schema:
 *           type: string
 *         description: Architecture name (e.g., amd64, arm64)
 *       - in: header
 *         name: x-access-token
 *         schema:
 *           type: string
 *         description: Optional JWT token for accessing private boxes
 *       - in: header
 *         name: Authorization
 *         schema:
 *           type: string
 *         description: Optional Bearer token for Vagrant authentication
 *     responses:
 *       302:
 *         description: Redirect to actual download endpoint
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *             description: URL to the actual file download endpoint
 *       403:
 *         description: Unauthorized access to private box
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Box, organization, or file not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Handle Vagrant box downloads
exports.downloadBox = async (req, res) => {
  const { organization, name, version, provider, architecture } = req.params;

  // req.userId and req.isServiceAccount are set by sessionAuth middleware or vagrantHandler

  log.app.info('Auth context in downloadBox:', {
    userId: req.userId,
    isServiceAccount: req.isServiceAccount,
    isVagrantRequest: req.isVagrantRequest,
    headers: req.headers,
  });

  try {
    const organizationData = await Organization.findOne({
      where: { name: organization },
    });

    if (!organizationData) {
      return res
        .status(404)
        .send({ message: `Organization not found with name: ${organization}.` });
    }

    const box = await Box.findOne({
      where: { name, organizationId: organizationData.id },
    });

    if (!box) {
      return res.status(404).send({ message: `Box not found with name: ${name}.` });
    }

    // Function to handle the download redirect
    const handleDownload = () => {
      const downloadUrl = `/api/organization/${organization}/box/${name}/version/${version}/provider/${provider}/architecture/${architecture}/file/download`;
      res.redirect(downloadUrl);
    };

    // If the box is public, allow download
    if (box.isPublic) {
      return handleDownload();
    }

    // For private boxes, check authentication
    if (req.isVagrantRequest) {
      // For Vagrant requests, we already have userId and isServiceAccount set by vagrantHandler
      if (req.isServiceAccount) {
        return handleDownload();
      }
    }

    // Check if we have a user ID (either from vagrantHandler or x-access-token)
    if (!req.userId) {
      return res.status(403).send({ message: 'Unauthorized access to private box.' });
    }

    // Check if user is member of the organization
    const membership = await db.UserOrg.findUserOrgRole(req.userId, organizationData.id);
    if (!membership) {
      return res.status(403).send({ message: 'Unauthorized access to private box.' });
    }

    // User is member of organization, allow download
    return handleDownload();
  } catch (err) {
    log.error.error('Error in downloadBox:', err);
    return res.status(500).send({
      message: 'Error processing download request',
      error: err.message,
    });
  }
};
