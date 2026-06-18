import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
const { iso: Iso, organization: Organization } = db;

/**
 * @swagger
 * /api/organization/{organization}/public-isos:
 *   get:
 *     summary: Get public ISOs for an organization
 *     description: Retrieve all public ISOs for a specific organization.
 *     tags: [ISOs]
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A list of public ISOs for the organization.
 *       500:
 *         description: Internal server error.
 */
export const getPublic = async (req, res) => {
  const { organization: organizationName } = req.params;
  try {
    const organization = await Organization.findOne({ where: { name: organizationName } });
    if (!organization) {
      return res.status(404).send({ message: req.__('organizations.organizationNotFound') });
    }
    const isos = await Iso.findAll({
      where: { organizationId: organization.id, isPublic: true },
      include: [{ model: Organization, as: 'organization', attributes: ['name'] }],
      order: [['createdAt', 'DESC']],
    });
    return res.status(200).send(isos);
  } catch (err) {
    log.error.error('Error fetching public ISOs:', { error: err.message });
    return res.status(500).send({ message: err.message || req.__('errors.operationFailed') });
  }
};
