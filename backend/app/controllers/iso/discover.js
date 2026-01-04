const db = require('../../models');
const { log } = require('../../utils/Logger');
const Iso = db.iso;
const Organization = db.organization;

/**
 * @swagger
 * /api/isos/discover:
 *   get:
 *     summary: Discover all public ISOs
 *     description: Retrieve a list of all ISOs that are marked as public across all organizations.
 *     tags: [ISOs]
 *     responses:
 *       200:
 *         description: A list of public ISOs.
 *       500:
 *         description: Internal server error.
 */
exports.discoverAll = async (req, res) => {
  try {
    const isos = await Iso.findAll({
      where: { isPublic: true },
      include: [{ model: Organization, as: 'organization', attributes: ['name'] }],
      order: [['createdAt', 'DESC']],
    });
    return res.status(200).send(isos);
  } catch (err) {
    log.error.error('Error discovering public ISOs:', {
      error: err.message,
    });
    return res.status(500).send({ message: err.message || req.__('isos.discoverError') });
  }
};
