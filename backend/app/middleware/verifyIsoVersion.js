import db from '../models/index.js';
import { log } from '../utils/Logger.js';
const { iso: ISO, isoVersions: IsoVersion, organization: Organization } = db;

const attachEntities = async (req, res, next) => {
  const { organization, name } = req.params;

  try {
    const organizationData = await Organization.findOne({
      where: { name: organization },
    });

    if (!organizationData) {
      return res
        .status(404)
        .send({ message: req.__('organizations.organizationNotFoundWithName', { organization }) });
    }

    const iso = await ISO.findOne({
      where: { name, organizationId: organizationData.id },
    });

    if (!iso) {
      return res
        .status(404)
        .send({ message: req.__('isos.notFoundWithName', { name, organization }) });
    }

    req.organizationData = organizationData;
    req.isoData = iso;

    return next();
  } catch (err) {
    log.error.error('Error attaching ISO version entities:', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

const checkVersionDuplicate = async (req, res, next) => {
  const { versionNumber: currentVersionNumber } = req.params;
  const { versionNumber } = req.body || {};
  const { isoData: iso } = req;

  if (!versionNumber || (currentVersionNumber && versionNumber === currentVersionNumber)) {
    return next();
  }

  try {
    const existingVersion = await IsoVersion.findOne({
      where: {
        versionNumber,
        isoId: iso.id,
      },
    });

    if (existingVersion) {
      return res
        .status(409)
        .send({ message: req.__('isos.versions.duplicate', { versionNumber, name: iso.name }) });
    }

    return next();
  } catch (err) {
    log.error.error('Error checking ISO version:', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

export { attachEntities, checkVersionDuplicate };
