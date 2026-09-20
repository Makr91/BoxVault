import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
import { downloadWhereFor, isMemberOf, resolveDownloadViewer } from './visibility.js';
import { withCounts } from './helpers.js';
import { reachOf } from '../../utils/orgMembership.js';
const {
  download: Download,
  downloadReleases: DownloadRelease,
  downloadPatches: DownloadPatch,
  downloadFiles: DownloadFile,
  organization: Organization,
} = db;

/**
 * @swagger
 * /api/downloads/discover:
 *   get:
 *     summary: Discover download products
 *     description: Retrieve the download products visible to the caller, each with its releases, patches and files. Anonymous requests get the public, published products of every organization; a signed-in user additionally gets every published product of the organizations they belong to and the unpublished ones they created; a service-account key the products of its own organization. Only the releases and patches within the caller's reach are answered on each product.
 *     tags: [Downloads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-access-token
 *         schema:
 *           type: string
 *         description: Optional JWT token (or raw service-account key) for member visibility
 *     responses:
 *       200:
 *         description: A list of download products, each with releases, patches, files, total download_count and its organization's name, email_hash and logo; every download_count is null to a caller who is not a member of the product's organization.
 *       500:
 *         description: Internal server error.
 */
export const discoverAll = async (req, res) => {
  try {
    const viewer = await resolveDownloadViewer(req);
    const downloads = await Download.findAll({
      where: downloadWhereFor(viewer),
      include: [
        {
          model: DownloadRelease,
          as: 'releases',
          include: [
            {
              model: DownloadPatch,
              as: 'patches',
              include: [{ model: DownloadFile, as: 'files' }],
            },
          ],
        },
        { model: Organization, as: 'organization', attributes: ['name', 'emailHash', 'logo'] },
      ],
      order: [['createdAt', 'DESC']],
    });
    return res
      .status(200)
      .send(
        downloads.map(download =>
          withCounts(
            download,
            isMemberOf(viewer, download.organizationId),
            reachOf(viewer, download)
          )
        )
      );
  } catch (err) {
    log.error.error('Error discovering downloads:', {
      error: err.message,
    });
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};
