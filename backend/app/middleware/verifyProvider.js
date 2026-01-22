// verifyProvider.js
import db from '../models/index.js';
const { providers: Provider, organization: Organization, box: Box, versions } = db;

const validateProvider = (req, res, next) => {
  const { name } = req.body;

  // For PUT requests, the name is optional. Only validate if provided.
  if (req.method === 'PUT' && typeof name === 'undefined') {
    return next();
  }

  // This regex allows only alphanumeric characters, hyphens, underscores, and periods
  const validCharsRegex = /^[0-9a-zA-Z-._]+$/;

  if (!name || !validCharsRegex.test(name)) {
    return res.status(400).send({
      message:
        'Invalid provider name. It should contain only alphanumeric characters, hyphens, underscores, and periods.',
    });
  }

  // Check if the name starts with a hyphen or period
  if (name.startsWith('-') || name.startsWith('.')) {
    return res.status(400).send({
      message: 'Provider name should not start with a hyphen or period.',
    });
  }

  return next();
};

// Function to check for duplicate provider names
const checkProviderDuplicate = async (req, res, next) => {
  const { organization, boxId, versionNumber } = req.params;
  const { name } = req.body;

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

    const version = await versions.findOne({
      where: { versionNumber, boxId: box.id },
    });

    if (!version) {
      return res.status(404).send({
        message: `Version ${versionNumber} not found for box ${boxId} in organization ${organization}.`,
      });
    }

    const existingProvider = await Provider.findOne({
      where: {
        name,
        versionId: version.id,
      },
    });

    if (existingProvider) {
      return res.status(409).send({
        message: `A provider with the name ${name} already exists for version ${versionNumber} of box ${boxId} in organization ${organization}.`,
      });
    }

    return next();
  } catch (err) {
    return res.status(500).send({
      message: err.message || 'Some error occurred while checking the provider.',
    });
  }
};

export { validateProvider, checkProviderDuplicate };
