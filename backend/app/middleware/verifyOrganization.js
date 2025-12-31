// verifyOrganization.js
const db = require('../models');
const Organization = db.organization;

// Function to check the format of the organization name
const validateOrganization = (req, res, next) => {
  const { organization } = req.body;
  const organizationRegex = /^[A-Za-z0-9.-]+$/;

  if (!organization || !organizationRegex.test(organization)) {
    return res.status(400).send({
      message:
        'Invalid organization name. It should contain only uppercase, lowercase, digits, dash, and period.',
    });
  }

  return next();
};

// Function to check for duplicate organization names
const checkOrganizationDuplicate = async (req, res, next) => {
  const { organization } = req.body;

  try {
    const existingOrganization = await Organization.findOne({
      where: { name: organization },
    });

    if (existingOrganization) {
      return res.status(400).send({
        message: `An organization with the name ${organization} already exists.`,
      });
    }

    return next();
  } catch (err) {
    return res.status(500).send({
      message: err.message || 'Some error occurred while checking the organization.',
    });
  }
};

const verifyOrganization = {
  validateOrganization,
  checkOrganizationDuplicate,
};

module.exports = verifyOrganization;
