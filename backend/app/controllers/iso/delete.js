const fs = require('fs');
const path = require('path');
const db = require('../../models');
const { log } = require('../../utils/Logger');
const { getIsoStorageRoot } = require('./helpers');

const ISO = db.iso;

const deleteIso = async (req, res) => {
  const { isoId } = req.params;

  try {
    const iso = await ISO.findByPk(isoId);
    if (!iso) {
      return res.status(404).send({ message: req.__('isos.notFound') });
    }

    const { checksum } = iso;
    const { storagePath } = iso;

    // Delete the DB record first
    await iso.destroy();

    // Check if any OTHER ISOs use this checksum/file
    const count = await ISO.count({
      where: { checksum },
    });

    if (count === 0) {
      // No other records reference this file, safe to delete physical file
      const fullPath = path.join(getIsoStorageRoot(), storagePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        log.file.info(`ISO Physical Delete: Removed ${fullPath} as no references remain.`);
      }
    } else {
      log.file.info(
        `ISO Delete: Kept physical file ${storagePath} because ${count} other records reference it.`
      );
    }

    return res.send({ message: req.__('isos.deleted') });
  } catch (err) {
    log.error.error('Error deleting ISO', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

module.exports = { delete: deleteIso };
