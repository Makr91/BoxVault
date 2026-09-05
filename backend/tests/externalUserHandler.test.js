import db from '../app/models/index.js';
import externalUserHandler from '../app/auth/external-user-handler.js';

const ISSUER = 'https://claims-idp.example';
const PROVIDER = 'oidc-claimsidp';

const authConfig = {
  auth: {
    oidc: { providers: { claimsidp: { enabled: { value: true }, issuer: { value: ISSUER } } } },
    external: { provisioning_fallback_action: { value: 'require_invite' } },
  },
};

describe('External user handling from identity-provider claims', () => {
  const uniqueId = Date.now().toString(36);
  const alphaUuid = `alpha-${uniqueId}`;
  const betaUuid = `beta-${uniqueId}`;
  const gammaUuid = `gamma-${uniqueId}`;
  const logoUuid = `logo-${uniqueId}`;
  const clashUuid = `clash-uuid-${uniqueId}`;
  let localOrg;
  let user;

  const orgByUuid = uuid =>
    db.organization.findOne({ where: { external_issuer: ISSUER, external_org_id: uuid } });

  const membershipOf = async (account, uuid) => {
    const org = await orgByUuid(uuid);
    return org ? db.UserOrg.findUserOrgRole(account.id, org.id) : null;
  };

  const sync = (account, organizations, issuer = ISSUER) =>
    externalUserHandler.syncOrganizationsFromClaim(account, { organizations }, issuer, db);

  beforeAll(async () => {
    localOrg = await db.organization.create({ name: `ClaimsLocal-${uniqueId}` });
    user = await db.user.create({
      username: `claims-user-${uniqueId}`,
      email: `claims-user-${uniqueId}@example.com`,
      password: 'external',
      verified: true,
    });
  });

  afterAll(async () => {
    await db.organization.destroy({ where: { external_issuer: ISSUER } });
    await db.organization.destroy({ where: { name: { [db.Sequelize.Op.like]: `ClashOrg%` } } });
    await localOrg.destroy();
    await db.user.destroy({ where: { email: { [db.Sequelize.Op.like]: `%${uniqueId}%` } } });
  });

  describe('syncOrganizationsFromClaim', () => {
    it('should leave everything alone without an organizations claim', async () => {
      await externalUserHandler.syncOrganizationsFromClaim(user, { sub: 'x' }, ISSUER, db);
      expect(await db.UserOrg.count({ where: { user_id: user.id } })).toBe(0);
    });

    it('should skip a claim that arrives without an issuer', async () => {
      await sync(user, [{ uuid: alphaUuid, name: 'Alpha' }], null);
      expect(await orgByUuid(alphaUuid)).toBeNull();
    });

    it('should mirror the claimed organizations, roles and primary pointer', async () => {
      await sync(user, [
        { uuid: alphaUuid, name: 'Alpha Org', roles: ['OWNER', 'member'], primary: true },
        { uuid: betaUuid, name: 'Beta Org', roles: ['admin'] },
        { name: 'no uuid here' },
      ]);
      const alpha = await membershipOf(user, alphaUuid);
      const beta = await membershipOf(user, betaUuid);
      expect(alpha.role).toBe('owner');
      expect(alpha.is_primary).toBe(true);
      expect(beta.role).toBe('admin');
      expect(beta.is_primary).toBe(false);
      await user.reload();
      expect(user.primary_organization_id).toBe((await orgByUuid(alphaUuid)).id);
    });

    it('should drop stale memberships, clear the pointer and demote roles on resync', async () => {
      await sync(user, [{ uuid: betaUuid, name: 'Beta Org', roles: [] }]);
      expect(await membershipOf(user, alphaUuid)).toBeNull();
      const beta = await membershipOf(user, betaUuid);
      expect(beta.role).toBe('member');
      await user.reload();
      expect(user.primary_organization_id).toBeNull();
    });

    it('should move the pointer onto the newly primary mirrored organization', async () => {
      await sync(user, [
        { uuid: betaUuid, name: 'Beta Org', roles: ['member'] },
        { uuid: gammaUuid, name: 'Gamma Org', roles: ['admin'], primary: true },
      ]);
      await user.reload();
      expect(user.primary_organization_id).toBe((await orgByUuid(gammaUuid)).id);
    });

    it('should never steal the pointer from a local organization', async () => {
      await user.update({ primary_organization_id: localOrg.id });
      await sync(user, [{ uuid: gammaUuid, name: 'Gamma Org', primary: true }]);
      await user.reload();
      expect(user.primary_organization_id).toBe(localOrg.id);
      expect(await membershipOf(user, betaUuid)).toBeNull();
    });

    it('should mirror the logo and description and refresh them on resync', async () => {
      await sync(user, [
        {
          uuid: logoUuid,
          name: 'Logo Org-',
          logo: 'https://logo.example/first.png',
          description: 'first description',
        },
      ]);
      const mirrored = await orgByUuid(logoUuid);
      expect(mirrored.name).toBe('Logo-Org');
      expect(mirrored.display_name).toBe('Logo Org-');
      expect(mirrored.logo).toBe('https://logo.example/first.png');
      expect(mirrored.description).toBe('first description');

      await sync(user, [
        {
          uuid: logoUuid,
          name: 'Logo Org-',
          logo: 'https://logo.example/second.png',
          description: 'second description',
        },
      ]);
      await mirrored.reload();
      expect(mirrored.logo).toBe('https://logo.example/second.png');
      expect(mirrored.description).toBe('second description');
    });

    it('should fall back to the full uuid when every short slug is taken', async () => {
      await db.organization.create({ name: 'ClashOrg' });
      await db.organization.create({ name: `ClashOrg-${clashUuid.slice(0, 6)}` });
      await db.organization.create({ name: `ClashOrg-${clashUuid.slice(0, 12)}` });
      await sync(user, [{ uuid: clashUuid, name: 'ClashOrg' }]);
      const mirrored = await orgByUuid(clashUuid);
      expect(mirrored.name).toBe(`ClashOrg-${clashUuid}`);
    });

    it('should roll back and rethrow when a claimed organization cannot be mirrored', async () => {
      await expect(
        sync(user, [
          { uuid: `delta-${uniqueId}`, name: 'Delta Org' },
          { uuid: 12345, name: '' },
        ])
      ).rejects.toThrow();
      expect(await orgByUuid(`delta-${uniqueId}`)).toBeNull();
      expect(await membershipOf(user, clashUuid)).not.toBeNull();
    });
  });

  describe('handleExternalUser', () => {
    const email = `fresh-${uniqueId}@example.com`;
    const baseProfile = {
      iss: ISSUER,
      sub: email,
      UUID: `fresh-uuid-${uniqueId}`,
      email,
      email_verified: true,
      name: 'Fresh Person',
      picture: 'https://cdn.example/fresh.png',
      preferences: { language: 'es', theme: 'dark' },
      zoneinfo: 'Europe/Berlin',
      organizations: [
        { uuid: `fresh-org-${uniqueId}`, name: 'Fresh Org', roles: ['admin'], primary: true },
      ],
    };

    it('should provision a new account from the claims', async () => {
      const created = await externalUserHandler.handleExternalUser(
        PROVIDER,
        baseProfile,
        db,
        authConfig
      );
      expect(created.email).toBe(email);
      expect(created.name).toBe('Fresh Person');
      expect(created.avatar_url).toBe('https://cdn.example/fresh.png');
      expect(created.preferredLanguage).toBe('es');
      expect(created.preferredTheme).toBe('dark');
      expect(created.timezone).toBe('Europe/Berlin');
      expect(created.authProvider).toBe('oidc');
      const fresh = await membershipOf(created, `fresh-org-${uniqueId}`);
      expect(fresh.role).toBe('admin');
      expect(await db.credential.count({ where: { user_id: created.id, provider: ISSUER } })).toBe(
        1
      );
    });

    it('should refresh the profile tiers on the next login', async () => {
      const returning = await externalUserHandler.handleExternalUser(
        PROVIDER,
        {
          ...baseProfile,
          name: 'Fresher Person',
          picture: 'https://cdn.example/fresher.png',
          preferences: { language: 'en', theme: 'light' },
          zoneinfo: 'America/Chicago',
        },
        db,
        authConfig
      );
      expect(returning.name).toBe('Fresher Person');
      expect(returning.avatar_url).toBe('https://cdn.example/fresher.png');
      expect(returning.preferredLanguage).toBe('en');
      expect(returning.preferredTheme).toBe('light');
      expect(returning.timezone).toBe('America/Chicago');
    });

    it('should ignore a picture that is not a web address', async () => {
      const returning = await externalUserHandler.handleExternalUser(
        PROVIDER,
        { ...baseProfile, picture: 'not a url' },
        db,
        authConfig
      );
      expect(returning.avatar_url).toBe('https://cdn.example/fresher.png');
    });

    it('should provision an account with no organization when the claim names none', async () => {
      const lonelyEmail = `lonely-${uniqueId}@example.com`;
      const lonely = await externalUserHandler.handleExternalUser(
        PROVIDER,
        {
          iss: ISSUER,
          sub: lonelyEmail,
          email: lonelyEmail,
          email_verified: true,
          organizations: [{ name: 'no uuid' }],
        },
        db,
        authConfig
      );
      expect(lonely.primary_organization_id).toBeNull();
      expect(await db.UserOrg.count({ where: { user_id: lonely.id } })).toBe(0);

      const again = await externalUserHandler.handleExternalUser(
        PROVIDER,
        {
          iss: ISSUER,
          sub: lonelyEmail,
          email: lonelyEmail,
          email_verified: true,
          organizations: [{ name: 'still no uuid' }],
        },
        db,
        authConfig
      );
      expect(again.id).toBe(lonely.id);
      expect(again.primary_organization_id).toBeNull();
    });

    it('should link an account without an organization when the claim is empty', async () => {
      const orphanEmail = `orphan-${uniqueId}@example.com`;
      const orphan = await db.user.create({
        username: `orphan-${uniqueId}`,
        email: orphanEmail,
        password: 'password',
        verified: true,
      });
      const linked = await externalUserHandler.handleExternalUser(
        PROVIDER,
        {
          iss: ISSUER,
          sub: `orphan-sub-${uniqueId}`,
          email: orphanEmail,
          email_verified: true,
          organizations: [],
        },
        db,
        authConfig
      );
      expect(linked.id).toBe(orphan.id);
      expect(linked.authProvider).toBe('oidc');
      expect(linked.primary_organization_id).toBeNull();
    });

    it('should refuse to link an existing account through an unverified mailbox', async () => {
      await expect(
        externalUserHandler.handleExternalUser(
          PROVIDER,
          { iss: ISSUER, sub: `link-${uniqueId}`, email: user.email, email_verified: false },
          db,
          authConfig
        )
      ).rejects.toThrow('Account linking denied');
    });

    it('should link an existing account through a verified mailbox', async () => {
      const linked = await externalUserHandler.handleExternalUser(
        PROVIDER,
        {
          iss: ISSUER,
          sub: `link-${uniqueId}`,
          email: user.email,
          email_verified: true,
          preferences: { theme: 'neon' },
        },
        db,
        authConfig
      );
      expect(linked.id).toBe(user.id);
      expect(linked.authProvider).toBe('oidc');
      expect(linked.preferredTheme).toBeNull();
      expect(await db.credential.count({ where: { user_id: user.id, provider: ISSUER } })).toBe(1);
    });
  });
});
