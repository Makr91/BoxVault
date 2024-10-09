// verifyBoxName.js
const db = require("../models");
const Box = db.box;

// Function to check the format of the box name
function validateBoxName(req, res, next) {
  const { name } = req.body;
  const boxNameRegex = /^[A-Za-z0-9.-]+$/;

  if (!name || !boxNameRegex.test(name)) {
    return res.status(400).send({
      message: "Invalid box name. It should contain only uppercase, lowercase, digits, dash, and period."
    });
  }

  next();
}

// Function to check for duplicate box names
async function checkBoxDuplicate(req, res, next) {
  const { organization } = req.params;
  const { name } = req.body;

  try {
    const existingBox = await Box.findOne({
      where: {
        name: name,
        organization: organization
      }
    });

    if (existingBox) {
      return res.status(400).send({
        message: `A box with the name ${name} already exists in organization ${organization}.`
      });
    }

    next();
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while checking the box."
    });
  }
}

const verifyBoxName = {
  validateBoxName: validateBoxName,
  checkBoxDuplicate: checkBoxDuplicate
};

module.exports = verifyBoxName;