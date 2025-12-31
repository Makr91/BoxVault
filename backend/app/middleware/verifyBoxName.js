// verifyBoxName.js
const db = require('../models');
const Box = db.box;

// Function to check the format of the box name
const validateBoxName = (req, res, next) => {
  const { name } = req.body;
  const boxNameRegex = /^[A-Za-z0-9.-]+$/;

  if (!name || !boxNameRegex.test(name)) {
    return res.status(400).send({
      message:
        'Invalid box name. It should contain only uppercase, lowercase, digits, dash, and period.',
    });
  }

  return next();
};

const checkBoxDuplicate = async (req, res, next) => {
  // This Function checks when a new box, or an existing box is created, if its name is not already in use by another box in the organization.
  // This Function should allow an existing box to be updated, so long as it is the only box in the organization with its name.
  // New Boxes are submitted via POST request, the POST request's body contains the name of the box.
  // Existing Boxes are submitted via a PUT request, the PUT request's URL (req.params) contains the CURRENT name of the Box, the PUT request's body contains the NEW NAME of the box.
  const { organization, name: currentName } = req.params;
  const { name: newName } = req.body;

  // When a User updates the box but keeps the name the same (i.e., they just want to update the description of a box), we want to make sure that we allow this change.
  if (currentName && currentName === newName) {
    return next();
  }

  if (!newName) {
    return next();
  }

  // We make a request to check if the Box we are adding already exists
  try {
    const existingBox = await Box.findOne({
      where: {
        name: newName,
        '$user.organization.name$': organization,
      },
      include: [
        {
          model: db.user,
          as: 'user',
          include: [
            {
              model: db.organization,
              as: 'organization',
            },
          ],
        },
      ],
    });

    // If the box exists and it's not the same box being updated, then we return a 400 error
    if (existingBox && existingBox.name !== currentName) {
      return res.status(400).send({
        message: `A box with the name ${newName} already exists in organization ${organization}.`,
      });
    }

    return next();
  } catch (err) {
    return res.status(500).send({
      message: err.message || 'Some error occurred while checking the box.',
    });
  }
};

const verifyBoxName = {
  validateBoxName,
  checkBoxDuplicate,
};

module.exports = verifyBoxName;
