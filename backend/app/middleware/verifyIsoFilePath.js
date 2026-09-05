import db from '../models/index.js';
import { log } from '../utils/Logger.js';

const { organization: Organization, iso: ISO, isoVersions: IsoVersion } = db;

const ARCHITECTURE_PATTERN = /^[0-9a-zA-Z-._]+$/;

const verifyIsoFilePath = async (req, res, next) => {
  const { organization, name, versionNumber, architecture } = req.params;

  if (
    !ARCHITECTURE_PATTERN.test(architecture) ||
    architecture.startsWith('-') ||
    architecture.startsWith('.') ||
    architecture.includes('..')
  ) {
    return res.status(400).send({ message: req.__('isos.invalidArchitecture') });
  }

  try {
    const organizationData = await Organization.findOne({
      where: { name: organization },
    });

    if (!organizationData) {
      log.app.warn('ISO path verification failed: Organization not found', { organization });
      return res
        .status(404)
        .send({ message: req.__('organizations.organizationNotFoundWithName', { organization }) });
    }

    const iso = await ISO.findOne({
      where: { name, organizationId: organizationData.id },
    });

    if (!iso) {
      log.app.warn('ISO path verification failed: ISO not found', { name, organization });
      return res
        .status(404)
        .send({ message: req.__('isos.notFoundWithName', { name, organization }) });
    }

    const version = await IsoVersion.findOne({
      where: { versionNumber, isoId: iso.id },
    });

    if (!version) {
      log.app.warn('ISO path verification failed: Version not found', { versionNumber, name });
      return res.status(404).send({ message: req.__('isos.versions.notFound') });
    }

    req.entities = {
      organization: organizationData,
      iso,
      version,
    };

    return next();
  } catch (err) {
    log.error.error('Error during ISO file path verification:', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

export { verifyIsoFilePath };
