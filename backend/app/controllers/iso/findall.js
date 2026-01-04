const db = require('../../models');
const { log } = require('../../utils/Logger');
const ISO = db.iso;
const Organization = db.organization;

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
