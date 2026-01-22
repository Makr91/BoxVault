// verifyVersion.js
import db from '../models/index.js';
import { log } from '../utils/Logger.js';
const { versions: Version, organization: Organization, box: Box } = db;

const validateVersion = (req, res, next) => {
  log.app.info('Full request body:', req.body);

  // Check in multiple places for the version number
  const versionNumber =
    req.body.versionNumber ||
    req.body.version ||
    req.query.versionNumber ||
    req.params.versionNumber;

  log.app.info('Validating version number:', versionNumber);

  // This regex allows only alphanumeric characters, hyphens, underscores, and periods
  const validCharsRegex = /^[0-9a-zA-Z-._]+$/;

  if (!versionNumber) {
    log.app.info('Version number is missing');
    return res.status(400).send({
      message: 'Version number is required.',
    });
  }

  if (!validCharsRegex.test(versionNumber)) {
    log.app.info('Invalid characters found in version number');
    return res.status(400).send({
      message:
        'Invalid version identifier. It should contain only alphanumeric characters, hyphens, underscores, and periods.',
    });
  }

  // Check if the version starts with a hyphen or period
  if (versionNumber.startsWith('-') || versionNumber.startsWith('.')) {
    log.app.info('Version number starts with a hyphen or period');
    return res.status(400).send({
      message: 'Version identifier should not start with a hyphen or period.',
    });
  }

  return next();
};

const attachEntities = async (req, res, next) => {
  const { organization, boxId } = req.params;

  try {
    const organizationData = await Organization.findOne({
      where: { name: organization },
    });

    if (!organizationData) {
      return res.status(404).send({
        message: `Organization not found with name: ${organization}.`,
      });
    }

    const box = await Box.findOne({
      where: { name: boxId, organizationId: organizationData.id },
    });

    if (!box) {
      return res.status(404).send({
        message: `Box ${boxId} not found in organization ${organization}.`,
      });
    }

    // Attach found entities to request
    req.organizationData = organizationData;
    req.boxData = box;

    return next();
  } catch (err) {
    return res.status(500).send({
      message: err.message || 'Some error occurred while checking the version.',
    });
  }
};

const checkVersionDuplicate = async (req, res, next) => {
  const { versionNumber: currentVersionNumber } = req.params;
  const versionNumber = req.body.versionNumber || req.body.version;
  const { organizationData, boxData: box } = req;

  // If versionNumber is not provided or matches current, skip duplicate check
  if (!versionNumber || (currentVersionNumber && versionNumber === currentVersionNumber)) {
    return next();
  }

  try {
    const existingVersion = await Version.findOne({
      where: {
        versionNumber,
        boxId: box.id,
      },
    });

    if (existingVersion) {
      return res.status(409).send({
        message: `A version with the number ${versionNumber} already exists for box ${box.id} in organization ${organizationData.name}.`,
      });
    }

    return next();
  } catch (err) {
    return res.status(500).send({
      message: err.message || 'Some error occurred while checking the version.',
    });
  }
};

export { validateVersion, checkVersionDuplicate, attachEntities };
