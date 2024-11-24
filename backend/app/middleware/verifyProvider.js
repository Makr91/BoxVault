// verifyProvider.js
const db = require("../models");
const Provider = db.providers;

function validateProvider(req, res, next) {
  const { name } = req.body;

  // This regex allows only alphanumeric characters, hyphens, underscores, and periods
  const validCharsRegex = /^[0-9a-zA-Z-._]+$/;

  if (!name || !validCharsRegex.test(name)) {
    return res.status(400).send({
      message: "Invalid provider name. It should contain only alphanumeric characters, hyphens, underscores, and periods."
    });
  }

  // Check if the name starts with a hyphen or period
  if (name.startsWith('-') || name.startsWith('.')) {
    return res.status(400).send({
      message: "Provider name should not start with a hyphen or period."
    });
  }

  next();
}

// Function to check for duplicate provider names
async function checkProviderDuplicate(req, res, next) {
  const { organization, boxId, versionNumber } = req.params;
  const { name } = req.body;

  try {
    const organizationData = await db.organization.findOne({
      where: { name: organization },
      include: [{
        model: db.user,
        as: 'users',
        include: [{
          model: db.box,
          as: 'box',
          where: { name: boxId },
          include: [{
            model: db.versions,
            as: 'versions',
            where: { versionNumber: versionNumber }
          }]
        }]
      }]
    });

    if (!organizationData) {
      return res.status(404).send({
        message: `Organization not found with name: ${organization}.`
      });
    }

    // Extract the box and version from the organization data
    const box = organizationData.users.flatMap(user => user.box)
      .find(box => box.name === boxId);

    if (!box) {
      return res.status(404).send({
        message: `Box ${boxId} not found in organization ${organization}.`
      });
    }

    const version = box.versions.find(version => version.versionNumber === versionNumber);

    if (!version) {
      return res.status(404).send({
        message: `Version ${versionNumber} not found for box ${boxId} in organization ${organization}.`
      });
    }

    const existingProvider = await Provider.findOne({
      where: {
        name: name,
        versionId: version.id
      }
    });

    if (existingProvider) {
      return res.status(400).send({
        message: `A provider with the name ${name} already exists for version ${versionNumber} of box ${boxId} in organization ${organization}.`
      });
    }

    next();
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while checking the provider."
    });
  }
}

const verifyProvider = {
  validateProvider: validateProvider,
  checkProviderDuplicate: checkProviderDuplicate
};

module.exports = verifyProvider;