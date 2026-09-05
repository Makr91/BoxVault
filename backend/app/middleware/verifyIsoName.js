import db from '../models/index.js';
import { log } from '../utils/Logger.js';
const { iso: ISO, organization: Organization } = db;

const validateIsoName = (req, res, next) => {
  const { name } = req.body || {};
  const isoNameRegex = /^[A-Za-z0-9.-]+$/;

  if (req.method === 'PUT' && typeof name === 'undefined') {
    return next();
  }

  if (!name || !isoNameRegex.test(name)) {
    return res.status(400).send({ message: req.__('isos.invalidName') });
  }

  if (name.includes('..')) {
    return res.status(400).send({ message: req.__('isos.invalidNameDots') });
  }

  return next();
};

const checkIsoDuplicate = async (req, res, next) => {
  const { organization, name: currentName } = req.params;
  const { name: newName } = req.body || {};

  if (currentName && currentName === newName) {
    return next();
  }

  if (!newName && req.method === 'PUT') {
    return next();
  }

  try {
    const org = await Organization.findOne({ where: { name: organization } });
    if (!org) {
      return res
        .status(404)
        .send({ message: req.__('organizations.organizationNotFoundWithName', { organization }) });
    }

    const existingIso = await ISO.findOne({
      where: {
        name: newName,
        organizationId: org.id,
      },
    });

    if (existingIso && existingIso.name !== currentName) {
      return res
        .status(409)
        .send({ message: req.__('isos.duplicateName', { name: newName, organization }) });
    }

    return next();
  } catch (err) {
    log.error.error('Error checking ISO name:', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

export { validateIsoName, checkIsoDuplicate };
