import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
import { downloadWhereFor, isMemberOf, resolveDownloadViewer } from './visibility.js';
import { withCounts } from './helpers.js';
import { familiesOf } from './family.js';
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
 * /api/organization/{organization}/download:
 *   get:
 *     summary: List the download products of an organization
 *     description: Retrieve the download products of an organization visible to the caller, each with its releases, patches and files. Anonymous requests get the public, published products; a member of the organization gets every published product plus the unpublished ones they created. Only the releases and patches within the caller's reach are answered on each product.
 *     tags: [Downloads]
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *       - in: header
 *         name: x-access-token
 *         schema:
 *           type: string
 *         description: Optional JWT token (or raw service-account key) for member visibility
 *     responses:
 *       200:
 *         description: List of download products with releases, patches, files and total download_count; every download_count is null to a caller who is not a member of the organization
 *       404:
 *         description: Organization not found
 *       500:
 *         description: Internal server error
 */
const findAll = async (req, res) => {
  const { organization: organizationName } = req.params;
  try {
    const organization = await Organization.findOne({ where: { name: organizationName } });
    if (!organization) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('organizations.organizationNotFound'),
      });
    }
    const viewer = await resolveDownloadViewer(req);
    const downloads = await Download.findAll({
      where: downloadWhereFor(viewer, organization.id),
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

    const member = isMemberOf(viewer, organization.id);
    const families = await familiesOf(organization.id);
    return res.send(
      downloads.map(download => withCounts(download, member, reachOf(viewer, download), families))
    );
  } catch (err) {
    log.error.error('Error finding all downloads', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { findAll };
