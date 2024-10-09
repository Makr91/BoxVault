// verifyVersion.js
const db = require("../models");
const Version = db.versions;

function validateVersion(req, res, next) {
  console.log("Full request body:", req.body);
  
  // Check in multiple places for the version number
  const versionNumber = req.body.versionNumber || req.body.version || req.query.versionNumber || req.params.versionNumber;
  
  console.log("Validating version number:", versionNumber);
  
  // This regex allows only alphanumeric characters, hyphens, underscores, and periods
  const validCharsRegex = /^[0-9a-zA-Z-._]+$/;

  if (!versionNumber) {
    console.log("Version number is missing");
    return res.status(400).send({
      message: "Version number is required."
    });
  }

  if (!validCharsRegex.test(versionNumber)) {
    console.log("Invalid characters found in version number");
    return res.status(400).send({
      message: "Invalid version identifier. It should contain only alphanumeric characters, hyphens, underscores, and periods."
    });
  }

  // Check if the version starts with a hyphen or period
  if (versionNumber.startsWith('-') || versionNumber.startsWith('.')) {
    console.log("Version number starts with a hyphen or period");
    return res.status(400).send({
      message: "Version identifier should not start with a hyphen or period."
    });
  }

  console.log("Version number is valid");
  next();
}

// Function to check for duplicate version numbers
async function checkVersionDuplicate(req, res, next) {
  const { organization, boxId } = req.params;
  const { versionNumber } = req.body;

  try {
    const existingVersion = await Version.findOne({
      where: {
        versionNumber: versionNumber,
        boxId: boxId
      },
      include: [{
        model: db.box,
        as: "box",
        where: { name: boxId, organization }
      }]
    });

    if (existingVersion) {
      return res.status(400).send({
        message: `A version with the number ${versionNumber} already exists for box ${boxId} in organization ${organization}.`
      });
    }

    next();
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while checking the version."
    });
  }
}

const verifyVersion = {
  validateVersion: validateVersion,
  checkVersionDuplicate: checkVersionDuplicate
};

module.exports = verifyVersion;