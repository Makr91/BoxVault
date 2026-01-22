import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
const { iso: ISO } = db;

/**
 * @swagger
 * /api/organization/{organization}/iso:
 *   get:
 *     summary: List ISOs for an organization
 *     description: Retrieve a list of all ISOs uploaded to a specific organization
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
 *     responses:
 *       200:
 *         description: List of ISOs
 *       404:
 *         description: Organization not found
 *       500:
 *         description: Internal server error
 */
const findAll = async (req, res) => {
  try {
    const isos = await ISO.findAll({
      where: { organizationId: req.organizationId },
      order: [['createdAt', 'DESC']],
    });

    return res.send(isos);
  } catch (err) {
    log.error.error('Error finding all ISOs', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

export { findAll };
