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
    const existingProvider = await Provider.findOne({
      where: {
        name: name
      },
      include: [{
        model: db.versions,
        as: "version",
        where: { versionNumber: versionNumber },
        include: [{
          model: db.box,
          as: "box",
          where: { name: boxId, organization }
        }]
      }]
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