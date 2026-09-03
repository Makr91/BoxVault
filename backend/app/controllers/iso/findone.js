import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { canSeeIso, resolveIsoViewer } from './visibility.js';
const { iso: ISO, organization: Organization } = db;

/**
 * @swagger
 * /api/organization/{organization}/iso/{isoId}:
 *   get:
 *     summary: Get ISO details
 *     description: Retrieve details for a specific ISO. A public, published ISO is readable by anyone; any other ISO requires membership of its organization, by JWT or by a service-account key of the organization.
 *     tags: [ISOs]
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
 *       - in: header
 *         name: x-access-token
 *         schema:
 *           type: string
 *         description: Optional JWT token (or raw service-account key) for member visibility
 *     responses:
 *       200:
 *         description: ISO details
 *       403:
 *         description: The ISO is not visible to the caller
 *       404:
 *         description: ISO or organization not found
 *       500:
 *         description: Internal server error
 */
const findOne = async (req, res) => {
  const { organization: organizationName, isoId } = req.params;

  try {
    const organization = await Organization.findOne({ where: { name: organizationName } });
    if (!organization) {
      return res.status(404).send({ message: req.__('organizations.organizationNotFound') });
    }
    const iso = await ISO.findOne({
      where: {
        id: isoId,
        organizationId: organization.id,
      },
    });
    if (!iso) {
      return res.status(404).send({ message: req.__('isos.notFound') });
    }
    const viewer = await resolveIsoViewer(req);
    if (!canSeeIso(viewer, iso)) {
      return res.status(403).send({ message: req.__('auth.forbidden') });
    }
    return res.send(iso);
  } catch (err) {
    log.error.error('Error finding ISO', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

export { findOne };
