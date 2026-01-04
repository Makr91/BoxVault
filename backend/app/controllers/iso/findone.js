const db = require('../../models');
const { log } = require('../../utils/Logger');
const ISO = db.iso;

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
    const iso = await ISO.findByPk(isoId);
    if (!iso) {
      return res.status(404).send({ message: req.__('isos.notFound') });
    }
    return res.send(iso);
  } catch (err) {
    log.error.error('Error finding ISO', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

module.exports = { findOne };
