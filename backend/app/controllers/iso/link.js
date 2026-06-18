import jwt from 'jsonwebtoken';
const { sign } = jwt;
import db from '../../models/index.js';
import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
const { iso: ISO, UserOrg } = db;

/**
 * @swagger
 * /api/organization/{organization}/iso/{isoId}/download-link:
 *   get:
 *     summary: Generate ISO download link
 *     description: Generate a temporary, secure download link for an ISO file
 *     tags: [ISOs]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *       - in: path
 *         name: isoId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the ISO
 *     responses:
 *       200:
 *         description: Download URL generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 downloadUrl:
 *                   type: string
 *       403:
 *         description: Forbidden
 *       404:
 *         description: ISO not found
 */
const getDownloadLink = async (req, res) => {
  const { isoId } = req.params;
  const { userId } = req;

  try {
    const iso = await ISO.findByPk(isoId);
    if (!iso) {
      return res.status(404).send({ message: req.__('isos.notFound') });
    }

    // Check permissions if private
    if (!iso.isPublic) {
      if (!userId) {
        return res.status(403).send({ message: req.__('auth.forbidden') });
      }

      const isMember = await UserOrg.findOne({
        where: { user_id: userId, organization_id: iso.organizationId },
      });

      if (!isMember) {
        return res.status(403).send({ message: req.__('auth.forbidden') });
      }
    }

    const authConfig = loadConfig('auth');
    // Generate a short-lived token for the download
    const token = sign(
      {
        userId,
        isServiceAccount: req.isServiceAccount,
        isoId: parseInt(isoId, 10), // Scope token to this specific ISO
        organization: req.params.organization,
      },
      authConfig.auth.jwt.jwt_secret.value,
      { expiresIn: '1h' }
    );

    const downloadUrl = `/api/organization/${req.params.organization}/iso/${isoId}/download?token=${token}`;
    return res.send({ downloadUrl });
  } catch (err) {
    log.error.error('Error generating download link', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

export { getDownloadLink };
