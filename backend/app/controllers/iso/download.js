const fs = require('fs');
const path = require('path');
const db = require('../../models');
const { getIsoStorageRoot } = require('./helpers');
const { log } = require('../../utils/Logger');

const ISO = db.iso;
const { UserOrg } = db;

const download = async (req, res) => {
  const { isoId } = req.params;

  try {
    const iso = await ISO.findByPk(isoId);
    if (!iso) {
      return res.status(404).send({ message: req.__('isos.notFound') });
    }

    // Check permissions: Allow if public, otherwise require org membership
    if (!iso.isPublic) {
      if (!req.userId) {
        return res.status(401).send({ message: req.__('auth.unauthorized') });
      }

      const isMember = await UserOrg.findOne({
        where: { user_id: req.userId, organization_id: iso.organizationId },
      });

      if (!isMember) {
        return res.status(403).send({ message: req.__('auth.forbidden') });
      }
    }

    const fullPath = path.join(getIsoStorageRoot(), iso.storagePath);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).send({ message: req.__('files.notFound') });
    }

    return res.download(fullPath, iso.filename);
  } catch (err) {
    log.error.error('Error downloading ISO', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

module.exports = { download };
