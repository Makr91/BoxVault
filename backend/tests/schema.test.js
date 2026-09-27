import app from '../server.js';
import db from '../app/models/index.js';
import { upgradeSchema, alignBackend, renameColumns } from '../app/models/schema.js';

const columnsOf = table => db.sequelize.getQueryInterface().describeTable(table);

const run = sql => db.sequelize.query(sql, { raw: true });

describe('The database schema across backends', () => {
  const uniqueId = Date.now().toString(36);

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
  });

  afterAll(async () => {
    await db.user.destroy({ where: { email: { [db.Sequelize.Op.like]: `%schema-${uniqueId}%` } } });
    await db.organization.destroy({
      where: { name: { [db.Sequelize.Op.like]: `SchemaOrg-${uniqueId}%` } },
    });
  });

  describe('letter case', () => {
    it('should find a user and an organization whatever the case of the name asked for', async () => {
      await db.user.create({
        username: `CaseUser-${uniqueId}`,
        email: `case-schema-${uniqueId}@example.com`,
        password: 'password',
        verified: true,
      });
      await db.organization.create({ name: `SchemaOrg-${uniqueId}` });

      const user = await db.user.findOne({ where: { username: `caseuser-${uniqueId}` } });
      expect(user.username).toBe(`CaseUser-${uniqueId}`);
      const organization = await db.organization.findOne({
        where: { name: `SCHEMAORG-${uniqueId}`.toUpperCase() },
      });
      expect(organization.name).toBe(`SchemaOrg-${uniqueId}`);
    });

    it('should refuse a second row that differs from the first by case alone', async () => {
      await expect(
        db.user.create({
          username: `CASEUSER-${uniqueId}`.toUpperCase(),
          email: `case-two-schema-${uniqueId}@example.com`,
          password: 'password',
          verified: true,
        })
      ).rejects.toThrow();
      await expect(
        db.organization.create({ name: `schemaorg-${uniqueId}`.toLowerCase() })
      ).rejects.toThrow();
    });

    it('should leave a database that already folds case alone', async () => {
      expect(await alignBackend(db.sequelize)).toEqual({ folded: [], widened: [] });
    });
  });

  describe('an upgrade', () => {
    it('should add a column the models name and the table lacks, keeping every row', async () => {
      const before = await db.user.count();
      await run('ALTER TABLE `users` DROP COLUMN `preferred_motion`');
      expect(await columnsOf('users')).not.toHaveProperty('preferred_motion');

      const changed = await upgradeSchema(db.sequelize);

      expect(await columnsOf('users')).toHaveProperty('preferred_motion');
      expect(changed.renamed).toEqual([]);
      expect(await db.user.count()).toBe(before);
    });

    it('should rename the renamed columns in order, their values moving with them', async () => {
      const account = await db.user.create({
        username: `RenameUser-${uniqueId}`,
        email: `rename-schema-${uniqueId}@example.com`,
        password: 'password',
        verified: true,
        preferredMode: 'dark',
        preferredTheme: 'lcars',
      });
      await run('ALTER TABLE `users` RENAME COLUMN `preferred_theme` TO `preferred_pack`');
      await run('ALTER TABLE `users` RENAME COLUMN `preferred_mode` TO `preferred_theme`');

      const changed = await upgradeSchema(db.sequelize);

      expect(changed.renamed).toEqual([
        'users.preferred_theme to users.preferred_mode',
        'users.preferred_pack to users.preferred_theme',
      ]);
      await account.reload();
      expect(account.preferredMode).toBe('dark');
      expect(account.preferredTheme).toBe('lcars');
    });

    it('should rename nothing on a database already renamed', async () => {
      expect(await renameColumns(db.sequelize)).toEqual([]);
    });

    it('should move the mode and add the theme on a database older than the theme column', async () => {
      const account = await db.user.findOne({ where: { username: `RenameUser-${uniqueId}` } });
      await run('ALTER TABLE `users` DROP COLUMN `preferred_theme`');
      await run('ALTER TABLE `users` RENAME COLUMN `preferred_mode` TO `preferred_theme`');

      const changed = await upgradeSchema(db.sequelize);

      expect(changed.renamed).toEqual(['users.preferred_theme to users.preferred_mode']);
      expect(await columnsOf('users')).toHaveProperty('preferred_theme');
      await account.reload();
      expect(account.preferredMode).toBe('dark');
      expect(account.preferredTheme).toBeNull();
    });
  });
});
