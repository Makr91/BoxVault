// verifyVersion.js
const db = require('../models');
const { log } = require('../utils/Logger');
const Version = db.versions;

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

const checkVersionDuplicate = async (req, res, next) => {
  const { organization, boxId, versionNumber: currentVersionNumber } = req.params; // Get currentVersionNumber from params
  const { versionNumber } = req.body; // Get the new versionNumber from the request body

  // If versionNumber is not null and matches the currentVersionNumber in req.params, allow changes
  if (versionNumber && versionNumber === currentVersionNumber) {
    return next();
  }

  // If versionNumber is not provided, skip duplicate check
  if (!versionNumber) {
    return next();
  }

  try {
    const organizationData = await db.organization.findOne({
      where: { name: organization },
      include: [
        {
          model: db.user,
          as: 'members',
          include: [
            {
              model: db.box,
              as: 'box',
              where: { name: boxId },
            },
          ],
        },
      ],
    });

    if (!organizationData) {
      return res.status(404).send({
        message: `Organization not found with name: ${organization}.`,
      });
    }

    // Extract the box from the organization data
    const box = organizationData.members.flatMap(user => user.box).find(b => b.name === boxId);

    if (!box) {
      return res.status(404).send({
        message: `Box ${boxId} not found in organization ${organization}.`,
      });
    }

    const existingVersion = await Version.findOne({
      where: {
        versionNumber,
        boxId: box.id,
      },
    });

    if (existingVersion) {
      return res.status(400).send({
        message: `A version with the number ${versionNumber} already exists for box ${boxId} in organization ${organization}.`,
      });
    }

    return next();
  } catch (err) {
    return res.status(500).send({
      message: err.message || 'Some error occurred while checking the version.',
    });
  }
};

const verifyVersion = {
  validateVersion,
  checkVersionDuplicate,
};

module.exports = verifyVersion;
