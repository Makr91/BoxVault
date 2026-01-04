const db = require('../../models');
const { log } = require('../../utils/Logger');

const ISO = db.iso;

const update = async (req, res) => {
  const { isoId } = req.params;
  const { isPublic } = req.body || {};

  try {
    const iso = await ISO.findByPk(isoId);
    if (!iso) {
      return res.status(404).send({ message: req.__('isos.notFound') });
    }

    if (isPublic !== undefined) {
      iso.isPublic = isPublic;
    }

    await iso.save();
    return res.send(iso);
  } catch (err) {
    log.error.error('Error updating ISO', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

module.exports = { update };
