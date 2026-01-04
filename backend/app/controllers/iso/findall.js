const db = require('../../models');
const { log } = require('../../utils/Logger');
const ISO = db.iso;
const Organization = db.organization;

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
  const { organization } = req.params;

  try {
    const org = await Organization.findOne({ where: { name: organization } });
    if (!org) {
      return res.status(404).send({ message: req.__('organizations.organizationNotFound') });
    }

    const isos = await ISO.findAll({
      where: { organizationId: org.id },
      order: [['createdAt', 'DESC']],
    });

    return res.send(isos);
  } catch (err) {
    log.error.error('Error finding all ISOs', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

module.exports = { findAll };
