const db = require('../../models');
const { log } = require('../../utils/Logger');
const ISO = db.iso;

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
