import db from '../models/index.js';

const resolveUserRecipients = async (userIds, issuer = null) => {
  if (!userIds.length) {
    return [];
  }
  const { Op } = db.Sequelize;
  const providerFilter = issuer || { [Op.startsWith]: 'https://' };
  const credentials = await db.credential.findAll({
    where: { user_id: { [Op.in]: userIds }, provider: providerFilter },
  });

  const seenUserIds = new Set();
  const recipients = [];
  for (const credential of credentials) {
    if (!seenUserIds.has(credential.user_id)) {
      seenUserIds.add(credential.user_id);
      recipients.push({ issuer: credential.provider, uuid: credential.subject });
    }
  }
  return recipients;
};

const resolveGlobalAdminRecipients = async () => {
  const admins = await db.user.findAll({
    include: [{ model: db.role, where: { name: 'admin' } }],
  });
  return resolveUserRecipients(admins.map(admin => admin.id));
};

const resolveOrgManagerRecipients = async organizationId => {
  const { Op } = db.Sequelize;
  const managers = await db.UserOrg.findAll({
    where: {
      organization_id: organizationId,
      role: { [Op.in]: ['owner', 'admin'] },
    },
  });
  return resolveUserRecipients(managers.map(manager => manager.user_id));
};

export { resolveUserRecipients, resolveGlobalAdminRecipients, resolveOrgManagerRecipients };
