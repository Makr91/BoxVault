import { loadConfig } from '../../../utils/config-loader.js';
import { generateDownloadToken } from '../../../utils/auth.js';
import { log } from '../../../utils/Logger.js';
import { problem } from '../../../utils/problem.js';
import { canSeeDownload, canSeeFile, resolveDownloadViewer } from '../visibility.js';

/**
 * @swagger
 * /api/organization/{organization}/download/{name}/release/{versionNumber}/patch/{patch}/file/{key}/get-download-link:
 *   post:
 *     summary: Generate a secure download link for a file
 *     description: Generate a time-limited download link for one file of a patch. The token is scoped to the organization, product, release, patch and file key. The product must be visible to the caller; a release, patch or file beyond the caller's reach answers 404.
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
 *                 download_url:
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

    const { download, release, patch: patchData, file } = req.entities;

    const viewer = await resolveDownloadViewer(req);
    if (!canSeeDownload(viewer, download)) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('files.unauthorized'),
      });
    }
    if (!canSeeFile(viewer, download, release, patchData, file)) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('files.notFound'),
      });
    }

    const downloadToken = generateDownloadToken(
      {
        user_id: userId,
        is_service_account: isServiceAccount,
        service_account_id: serviceAccountId,
        organization,
        download: name,
        version_number: versionNumber,
        patch,
        key: file.key,
      },
      authConfig.auth?.jwt?.download_link_expiry || '1h'
    );

    const downloadUrl = `${appConfig.boxvault.api_url}/organization/${organization}/download/${name}/release/${versionNumber}/patch/${patch}/file/${file.key}/download?token=${downloadToken}`;

    return res.status(200).json({ download_url: downloadUrl });
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
