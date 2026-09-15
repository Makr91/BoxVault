import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
import { canSeeDownload, isMemberOf, resolveDownloadViewer } from './visibility.js';
import { withCounts } from './helpers.js';
const {
  download: Download,
  downloadReleases: DownloadRelease,
  downloadPatches: DownloadPatch,
  downloadFiles: DownloadFile,
  organization: Organization,
  user: Users,
} = db;

/**
 * @swagger
 * /api/organization/{organization}/download/{name}:
 *   get:
 *     summary: Get a download product
 *     description: Retrieve a download product with its releases, patches and files. A public, published product is readable by anyone; a published private product requires membership of its organization; an unpublished product is readable by its creator alone.
 *     tags: [Downloads]
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
 *       - in: header
 *         name: x-access-token
 *         schema:
 *           type: string
 *         description: Optional JWT token (or raw service-account key) for member visibility
 *     responses:
 *       200:
 *         description: The product with releases, patches, files, organization, user and total downloadCount; every downloadCount is null to a caller who is not a member of the organization
 *       403:
 *         description: The product is not visible to the caller
 *       404:
 *         description: Product or organization not found
 *       500:
 *         description: Internal server error
 */
const findOne = async (req, res) => {
  const { organization: organizationName, name } = req.params;

  try {
    const organization = await Organization.findOne({ where: { name: organizationName } });
    if (!organization) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('organizations.organizationNotFound'),
      });
    }
    const download = await Download.findOne({
      where: { name, organizationId: organization.id },
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
        { model: Users, as: 'user', attributes: ['id', 'username', 'emailHash'] },
      ],
    });
    if (!download) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('downloads.notFound'),
      });
    }
    const viewer = await resolveDownloadViewer(req);
    if (!canSeeDownload(viewer, download)) {
      return problem(res, req, { status: 403, type: 'forbidden', title: req.__('auth.forbidden') });
    }
    return res.send(withCounts(download, isMemberOf(viewer, organization.id)));
  } catch (err) {
    log.error.error('Error finding download', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { findOne };
