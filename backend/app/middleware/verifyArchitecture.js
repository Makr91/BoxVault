// verifyArchitecture.js
const db = require('../models');
const { log } = require('../utils/Logger');
const Architecture = db.architectures;

const validateArchitecture = (req, res, next) => {
  const { name } = req.body;
  log.app.info('Validating architecture name:', name);

  // This regex allows only alphanumeric characters, hyphens, underscores, and periods
  const validCharsRegex = /^[0-9a-zA-Z-._]+$/;

  if (!name || !validCharsRegex.test(name)) {
    return res.status(400).send({
      message: `Invalid architecture name ${name}. It should contain only alphanumeric characters, hyphens, underscores, and periods.`,
    });
  }

  // Check if the name starts with a hyphen or period
  if (name.startsWith('-') || name.startsWith('.')) {
    return res.status(400).send({
      message: 'Architecture name should not start with a hyphen or period.',
    });
  }

  return next();
};

const checkArchitectureDuplicate = async (req, res, next) => {
  const { organization, boxId, versionNumber, providerName } = req.params;
  const { name } = req.body;

  try {
    const organizationData = await db.organization.findOne({
      where: { name: organization },
    });

    if (!organizationData) {
      return res.status(404).send({
        message: `Organization not found with name: ${organization}.`,
      });
    }

    const box = await db.box.findOne({
      where: { name: boxId, organizationId: organizationData.id },
    });

    if (!box) {
      return res.status(404).send({
        message: `Box ${boxId} not found in organization ${organization}.`,
      });
    }

    const version = await db.versions.findOne({
      where: { versionNumber, boxId: box.id },
    });

    if (!version) {
      return res.status(404).send({
        message: `Version ${versionNumber} not found for box ${boxId} in organization ${organization}.`,
      });
    }

    const provider = await db.providers.findOne({
      where: { name: providerName, versionId: version.id },
    });

    if (!provider) {
      return res.status(404).send({
        message: `Provider ${providerName} not found for version ${versionNumber} in box ${boxId}.`,
      });
    }

    const existingArchitecture = await Architecture.findOne({
      where: {
        name,
        providerId: provider.id,
      },
    });

    if (existingArchitecture) {
      return res.status(400).send({
        message: `An architecture with the name ${name} already exists for provider ${providerName} in version ${versionNumber} of box ${boxId} in organization ${organization}.`,
      });
    }

    return next();
  } catch (err) {
    return res.status(500).send({
      message: err.message || 'Some error occurred while checking the architecture.',
    });
  }
};

const verifyArchitecture = {
  validateArchitecture,
  checkArchitectureDuplicate,
};

module.exports = verifyArchitecture;
