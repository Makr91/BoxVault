// verifyArchitecture.js
const db = require("../models");
const Architecture = db.architectures;

function validateArchitecture(req, res, next) {
    const { name } = req.body;
    console.log("Validating architecture name:", name);
    
    // This regex allows only alphanumeric characters, hyphens, underscores, and periods
    const validCharsRegex = /^[0-9a-zA-Z-._]+$/;
  
    if (!name || !validCharsRegex.test(name)) {
      return res.status(400).send({
        message: `Invalid architecture name ${ name}. It should contain only alphanumeric characters, hyphens, underscores, and periods.`
      });
    }
  
    // Check if the name starts with a hyphen or period
    if (name.startsWith('-') || name.startsWith('.')) {
      return res.status(400).send({
        message: "Architecture name should not start with a hyphen or period."
      });
    }
  
    next();
  }

async function checkArchitectureDuplicate(req, res, next) {
  const { organization, boxId, versionNumber, providerName } = req.params;
  const { name } = req.body;

  try {
    const existingArchitecture = await Architecture.findOne({
      where: {
        name: name
      },
      include: [{
        model: db.providers,
        as: "provider",
        where: { name: providerName },
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
      }]
    });

    if (existingArchitecture) {
      return res.status(400).send({
        message: `An architecture with the name ${name} already exists for provider ${providerName} in version ${versionNumber} of box ${boxId} in organization ${organization}.`
      });
    }

    next();
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while checking the architecture."
    });
  }
}

const verifyArchitecture = {
  validateArchitecture: validateArchitecture,
  checkArchitectureDuplicate: checkArchitectureDuplicate
};

module.exports = verifyArchitecture;