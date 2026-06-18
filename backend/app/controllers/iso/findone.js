import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
const { iso: ISO } = db;

/**
 * @swagger
 * /api/organization/{organization}/iso/{isoId}:
 *   get:
 *     summary: Get ISO details
 *     description: Retrieve details for a specific ISO
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
 *         name: isoId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the ISO
 *     responses:
 *       200:
 *         description: ISO details
 *       404:
 *         description: ISO not found
 *       500:
 *         description: Internal server error
 */
const findOne = async (req, res) => {
  const { isoId } = req.params;

  try {
    const iso = await ISO.findOne({
      where: {
        id: isoId,
        organizationId: req.organizationId,
      },
    });
    if (!iso) {
      return res.status(404).send({ message: req.__('isos.notFound') });
    }
    return res.send(iso);
  } catch (err) {
    log.error.error('Error finding ISO', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

export { findOne };
