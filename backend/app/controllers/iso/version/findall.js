import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import { problem } from '../../../utils/problem.js';
import { canSeeIso, resolveIsoViewer } from '../visibility.js';
const { isoVersions: IsoVersion, isoFiles: IsoFile } = db;

/**
 * @swagger
 * /api/organization/{organization}/iso/{name}/version:
 *   get:
 *     summary: List the versions of an ISO
 *     description: Retrieve every version of an ISO with its per-architecture files. A public, published ISO is readable by anyone; any other ISO requires membership of its organization.
 *     tags: [ISOs]
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
 *       - in: header
 *         name: x-access-token
 *         schema:
 *           type: string
 *         description: Optional JWT token (or raw service-account key) for member visibility
 *     responses:
 *       200:
 *         description: List of versions with their files
 *       403:
 *         description: The ISO is not visible to the caller
 *       404:
 *         description: Organization or ISO not found
 *       500:
 *         description: Internal server error
 */
const findAll = async (req, res) => {
  try {
    const { isoData: iso } = req;

    const viewer = await resolveIsoViewer(req);
    if (!canSeeIso(viewer, iso)) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('versions.unauthorized'),
      });
    }

    const versions = await IsoVersion.findAll({
      where: { isoId: iso.id },
      include: [{ model: IsoFile, as: 'files' }],
      order: [['createdAt', 'DESC']],
    });

    return res.send(versions);
  } catch (err) {
    log.error.error('Error retrieving ISO versions', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { findAll };
