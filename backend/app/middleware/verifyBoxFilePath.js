import db from '../models/index.js';
import { log } from '../utils/Logger.js';

const {
  organization: Organization,
  box: Box,
  versions: Version,
  providers: Provider,
  architectures: Architecture,
} = db;

const verifyBoxFilePath = async (req, res, next) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;

  try {
    const organizationData = await Organization.findOne({
      where: { name: organization },
    });

    if (!organizationData) {
      log.app.warn('Path verification failed: Organization not found', { organization });
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: req.__('organizations.organizationNotFoundWithName', { organization }),
      });
    }

    const boxData = await Box.findOne({
      where: { name: boxId, organizationId: organizationData.id },
    });

    if (!boxData) {
      log.app.warn('Path verification failed: Box not found', { boxId, organization });
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: req.__('boxes.boxNotFoundInOrg', { boxId, organization }),
      });
    }

    const versionData = await Version.findOne({
      where: { versionNumber, boxId: boxData.id },
    });

    if (!versionData) {
      log.app.warn('Path verification failed: Version not found', { versionNumber, boxId });
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: req.__('versions.versionNotFound'),
      });
    }

    const providerData = await Provider.findOne({
      where: { name: providerName, versionId: versionData.id },
    });

    if (!providerData) {
      log.app.warn('Path verification failed: Provider not found', { providerName, versionNumber });
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: req.__('providers.providerNotFound'),
      });
    }

    const architectureData = await Architecture.findOne({
      where: { name: architectureName, providerId: providerData.id },
    });

    if (!architectureData) {
      log.app.warn('Path verification failed: Architecture not found', {
        architectureName,
        providerName,
      });
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: req.__('architectures.notFound'),
      });
    }

    // Attach entities to the request object for subsequent middleware/controllers
    req.entities = {
      organization: organizationData,
      box: boxData,
      version: versionData,
      provider: providerData,
      architecture: architectureData,
    };

    return next();
  } catch (err) {
    log.error.error('Error during box file path verification:', {
      error: err.message,
      stack: err.stack,
      params: req.params,
    });
    return res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'An error occurred while verifying the file path.',
    });
  }
};

export { verifyBoxFilePath };
