import { loadConfig } from '../../../utils/config-loader.js';
import { generateDownloadToken } from '../../../utils/auth.js';
import { log } from '../../../utils/Logger.js';
import { problem } from '../../../utils/problem.js';
import { canSeeDownload, resolveDownloadViewer } from '../visibility.js';

/**
 * @swagger
 * /api/organization/{organization}/download/{name}/release/{versionNumber}/patch/{patch}/file/{key}/get-download-link:
 *   post:
 *     summary: Generate a secure download link for a file
 *     description: Generate a time-limited download link for one file of a patch. The token is scoped to the organization, product, release, patch and file key. The product must be visible to the caller.
 *     tags: [Downloads]
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
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Product name
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Release identifier
 *       - in: path
 *         name: patch
 *         required: true
 *         schema:
 *           type: string
 *         description: Patch name
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: File key or file name
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
 *       403:
 *         description: The product is not visible to the caller
 *       404:
 *         description: Organization, product, release, patch or file not found
 *       500:
 *         description: Internal server error
 */
const getDownloadLink = async (req, res) => {
  const { organization, name, versionNumber, patch } = req.params;
  const { userId, isServiceAccount, serviceAccountId } = req;

  try {
    const appConfig = loadConfig('app');
    const authConfig = loadConfig('auth');

    const { download, file } = req.entities;

    const viewer = await resolveDownloadViewer(req);
    if (!canSeeDownload(viewer, download)) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('files.unauthorized'),
      });
    }

    const downloadToken = generateDownloadToken(
      {
        userId,
        isServiceAccount,
        serviceAccountId,
        organization,
        download: name,
        versionNumber,
        patch,
        key: file.key,
      },
      authConfig.auth?.jwt?.download_link_expiry || '1h'
    );

    const downloadUrl = `${appConfig.boxvault.api_url}/organization/${organization}/download/${name}/release/${versionNumber}/patch/${patch}/file/${file.key}/download?token=${downloadToken}`;

    return res.status(200).json({ downloadUrl });
  } catch (err) {
    log.error.error('Error generating download file link', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('files.link.error'),
    });
  }
};

export { getDownloadLink };
