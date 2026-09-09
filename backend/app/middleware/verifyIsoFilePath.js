import db from '../models/index.js';
import { log } from '../utils/Logger.js';
import { problem } from '../utils/problem.js';

const { organization: Organization, iso: ISO, isoVersions: IsoVersion } = db;

const ARCHITECTURE_PATTERN = /^[0-9a-zA-Z-._]+$/;

const notFound = (req, res, title) => problem(res, req, { status: 404, type: 'not-found', title });

const verifyIsoFilePath = async (req, res, next) => {
  const { organization, name, versionNumber, architecture } = req.params;

  if (
    !ARCHITECTURE_PATTERN.test(architecture) ||
    architecture.startsWith('-') ||
    architecture.startsWith('.') ||
    architecture.includes('..')
  ) {
    return problem(res, req, {
      status: 400,
      type: 'bad-request',
      title: req.__('isos.invalidArchitecture'),
    });
  }

  try {
    const organizationData = await Organization.findOne({
      where: { name: organization },
    });

    if (!organizationData) {
      log.app.warn('ISO path verification failed: Organization not found', { organization });
      return notFound(
        req,
        res,
        req.__('organizations.organizationNotFoundWithName', { organization })
      );
    }

    const iso = await ISO.findOne({
      where: { name, organizationId: organizationData.id },
    });

    if (!iso) {
      log.app.warn('ISO path verification failed: ISO not found', { name, organization });
      return notFound(req, res, req.__('isos.notFoundWithName', { name, organization }));
    }

    const version = await IsoVersion.findOne({
      where: { versionNumber, isoId: iso.id },
    });

    if (!version) {
      log.app.warn('ISO path verification failed: Version not found', { versionNumber, name });
      return notFound(req, res, req.__('isos.versions.notFound'));
    }

    req.entities = {
      organization: organizationData,
      iso,
      version,
    };

    return next();
  } catch (err) {
    log.error.error('Error during ISO file path verification:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { verifyIsoFilePath };
