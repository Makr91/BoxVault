// verifyOrganization.js
import db from '../models/index.js';
const { organization: Organization } = db;

// Function to check the format of the organization name
const validateOrganization = (req, res, next) => {
  const { organization } = req.body;
  const organizationRegex = /^[A-Za-z0-9.-]+$/;

  // For PUT requests, the name is optional. Only validate if provided.
  if (req.method === 'PUT' && typeof organization === 'undefined') {
    return next();
  }

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

export default verifyOrganization;
