const jwt = require('jsonwebtoken');
const db = require('../../models');
const { loadConfig } = require('../../utils/config-loader');
const { log } = require('../../utils/Logger');

const ISO = db.iso;
const { UserOrg } = db;

const getDownloadLink = async (req, res) => {
  const { isoId } = req.params;
  const { userId } = req;

  try {
    const iso = await ISO.findByPk(isoId);
    if (!iso) {
      return res.status(404).send({ message: req.__('isos.notFound') });
    }

    // Check permissions if private
    if (!iso.isPublic) {
      const isMember = await UserOrg.findOne({
        where: { user_id: userId, organization_id: iso.organizationId },
      });

      if (!isMember) {
        return res.status(403).send({ message: req.__('auth.forbidden') });
      }
    }

    const authConfig = loadConfig('auth');
    // Generate a short-lived token for the download
    const token = jwt.sign(
      { userId, isServiceAccount: req.isServiceAccount },
      authConfig.auth.jwt.jwt_secret.value,
      { expiresIn: '1h' }
    );

    const downloadUrl = `/api/organization/${req.params.organization}/iso/${isoId}/download?token=${token}`;
    return res.send({ downloadUrl });
  } catch (err) {
    log.error.error('Error generating download link', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

module.exports = { getDownloadLink };
