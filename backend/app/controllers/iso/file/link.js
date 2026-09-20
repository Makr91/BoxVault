import { loadConfig } from '../../../utils/config-loader.js';
import { generateDownloadToken } from '../../../utils/auth.js';
import { log } from '../../../utils/Logger.js';
import { problem } from '../../../utils/problem.js';
import { canSeeIso, canSeeIsoVersion, resolveIsoViewer } from '../visibility.js';

/**
 * @swagger
 * /api/organization/{organization}/iso/{name}/version/{versionNumber}/architecture/{architecture}/file/get-download-link:
 *   post:
 *     summary: Generate a secure ISO download link
 *     description: Generate a time-limited download link for one architecture of an ISO version. The token is scoped to the organization, ISO name, version and architecture. A version beyond the caller's reach answers 404.
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
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: ISO name
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Version number
 *       - in: path
 *         name: architecture
 *         required: true
 *         schema:
 *           type: string
 *         description: Architecture
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
 *         description: The ISO is not visible to the caller
 *       404:
 *         description: Organization, ISO or version not found
 *       500:
 *         description: Internal server error
 */
const getDownloadLink = async (req, res) => {
  const { organization, name, versionNumber, architecture } = req.params;
  const { userId, isServiceAccount, serviceAccountId } = req;

  try {
    const appConfig = loadConfig('app');
    const authConfig = loadConfig('auth');

    const { iso, version } = req.entities;

    const viewer = await resolveIsoViewer(req);
    if (!canSeeIso(viewer, iso)) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('files.unauthorized'),
      });
    }
    if (!canSeeIsoVersion(viewer, iso, version)) {
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
        iso: name,
        version_number: versionNumber,
        architecture,
      },
      authConfig.auth?.jwt?.download_link_expiry || '1h'
    );

    const downloadUrl = `${appConfig.boxvault.api_url}/organization/${organization}/iso/${name}/version/${versionNumber}/architecture/${architecture}/file/download?token=${downloadToken}`;

    return res.status(200).json({ download_url: downloadUrl });
  } catch (err) {
    log.error.error('Error generating ISO download link', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('files.link.error'),
    });
  }
};

export { getDownloadLink };
