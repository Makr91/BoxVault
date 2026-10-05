import fs from 'fs';
import path from 'path';
import request from 'supertest';
import app from '../server.js';
import db from '../app/models/index.js';
import externalUserHandler from '../app/auth/external-user-handler.js';
import { getSecureBoxPath } from '../app/utils/paths.js';

const ISSUER = 'https://claims-idp.example';
const OTHER_FACE = 'https://claims-idp-face.example';
const PROVIDER = 'oidc-claimsidp';

const authConfig = {
  auth: {
    oidc: { providers: { claimsidp: { enabled: true, issuer: ISSUER } } },
    external: { provisioning_fallback_action: 'require_invite' },
  },
};

describe('External user handling from identity-provider claims', () => {
  const uniqueId = Date.now().toString(36);
  const alphaUuid = `alpha-${uniqueId}`;
  const betaUuid = `beta-${uniqueId}`;
  const gammaUuid = `gamma-${uniqueId}`;
  const logoUuid = `logo-${uniqueId}`;
  const clashUuid = `clash-uuid-${uniqueId}`;
  const reservedUuid = `reserved-uuid-${uniqueId}`;
  let localOrg;
  let user;

  const orgByUuid = uuid => db.organization.findOne({ where: { external_org_id: uuid } });

  const membershipOf = async (account, uuid) => {
    const org = await orgByUuid(uuid);
    return org ? db.UserOrg.findUserOrgRole(account.id, org.id) : null;
  };

  const sync = (account, organizations, issuer = ISSUER) =>
    externalUserHandler.syncOrganizationsFromClaim(account, { organizations }, issuer, db);

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
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

    it('should mirror a GUEST role and let a higher role win over it', async () => {
      await sync(user, [
        { uuid: alphaUuid, name: 'Alpha Org', roles: ['GUEST'] },
        { uuid: betaUuid, name: 'Beta Org', roles: ['admin'] },
      ]);
      expect((await membershipOf(user, alphaUuid)).role).toBe('guest');

      await sync(user, [
        { uuid: alphaUuid, name: 'Alpha Org', roles: ['GUEST', 'MEMBER'] },
        { uuid: betaUuid, name: 'Beta Org', roles: ['admin'] },
      ]);
      expect((await membershipOf(user, alphaUuid)).role).toBe('member');
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

    it('should step past a reserved path segment when slugging the claimed name', async () => {
      await sync(user, [{ uuid: reservedUuid, name: 'Admin' }]);
      const mirrored = await orgByUuid(reservedUuid);
      expect(mirrored.name).toBe(`Admin-${reservedUuid.slice(0, 6)}`);
      expect(mirrored.display_name).toBe('Admin');
    });

    it('should sweep memberships of every mirror when the claim arrives through another face', async () => {
      await sync(user, [{ uuid: gammaUuid, name: 'Gamma Org', roles: ['admin'] }], OTHER_FACE);
      expect(await membershipOf(user, reservedUuid)).toBeNull();
      expect((await membershipOf(user, gammaUuid)).role).toBe('admin');
      expect(await db.organization.count({ where: { external_org_id: gammaUuid } })).toBe(1);
      expect((await orgByUuid(gammaUuid)).external_issuer).toBe(ISSUER);
    });

    it('should reuse the mirror an earlier face minted instead of minting a second one', async () => {
      await sync(user, [{ uuid: reservedUuid, name: 'Admin' }], OTHER_FACE);
      expect(await db.organization.count({ where: { external_org_id: reservedUuid } })).toBe(1);
      const mirrored = await orgByUuid(reservedUuid);
      expect(mirrored.external_issuer).toBe(ISSUER);
      expect(mirrored.name).toBe(`Admin-${reservedUuid.slice(0, 6)}`);
      expect((await membershipOf(user, reservedUuid)).role).toBe('member');
      expect(await membershipOf(user, gammaUuid)).toBeNull();
    });

    it('should roll back and rethrow when a claimed organization cannot be mirrored', async () => {
      await expect(
        sync(user, [
          { uuid: `delta-${uniqueId}`, name: 'Delta Org' },
          { uuid: 12345, name: '' },
        ])
      ).rejects.toThrow();
      expect(await orgByUuid(`delta-${uniqueId}`)).toBeNull();
      expect(await membershipOf(user, reservedUuid)).not.toBeNull();
    });
  });

  describe('a rename at the identity provider', () => {
    const renameUuid = `${uniqueId}-rename-uuid`;
    const oldName = `Before-${uniqueId}`;
    const newName = `After-${uniqueId}`;
    let renamer;

    beforeAll(async () => {
      renamer = await db.user.create({
        username: `claims-renamer-${uniqueId}`,
        email: `claims-renamer-${uniqueId}@example.com`,
        password: 'external',
        verified: true,
      });
    });

    it('should key the mirror on the claim uuid as its own uuid and carry its personal flag', async () => {
      await sync(renamer, [
        { uuid: renameUuid, name: `Before ${uniqueId}`, roles: ['owner'], personal: true },
      ]);
      const mirrored = await orgByUuid(renameUuid);
      expect(mirrored.uuid).toBe(renameUuid);
      expect(mirrored.personal).toBe(true);
      expect(mirrored.name).toBe(oldName);
    });

    it('should rename the organization, move its storage and download paths, and free the old name', async () => {
      const mirrored = await orgByUuid(renameUuid);
      const oldPath = getSecureBoxPath(oldName);
      const newPath = getSecureBoxPath(newName);
      fs.mkdirSync(path.join(oldPath, 'downloads', 'tool', '1.0', 'release'), { recursive: true });
      fs.writeFileSync(path.join(oldPath, 'downloads', 'tool', '1.0', 'release', 'a.bin'), 'a');
      const product = await db.download.create({
        name: 'tool',
        organizationId: mirrored.id,
        userId: renamer.id,
      });
      const release = await db.downloadReleases.create({
        versionNumber: '1.0',
        downloadId: product.id,
      });
      const patch = await db.downloadPatches.create({
        name: 'release',
        downloadReleaseId: release.id,
      });
      const file = await db.downloadFiles.create({
        key: 'a',
        fileName: 'a.bin',
        fileSize: 1,
        original: true,
        storagePath: `${oldName}/downloads/tool/1.0/release/a.bin`,
        downloadPatchId: patch.id,
      });

      await sync(renamer, [{ uuid: renameUuid, name: `After ${uniqueId}`, roles: ['owner'] }]);

      await mirrored.reload();
      expect(mirrored.name).toBe(newName);
      expect(mirrored.display_name).toBe(`After ${uniqueId}`);
      expect(mirrored.uuid).toBe(renameUuid);
      expect(mirrored.personal).toBe(false);
      expect(fs.existsSync(oldPath)).toBe(false);
      expect(
        fs.existsSync(path.join(newPath, 'downloads', 'tool', '1.0', 'release', 'a.bin'))
      ).toBe(true);
      await file.reload();
      expect(file.storagePath).toBe(`${newName}/downloads/tool/1.0/release/a.bin`);

      expect((await request(app).get(`/api/organization/${oldName}`)).statusCode).toBe(404);
      expect((await request(app).get(`/api/organization/${newName}`)).statusCode).toBe(200);
      const squatter = await db.organization.create({ name: oldName });
      expect(squatter.name).toBe(oldName);

      await squatter.destroy();
      await product.destroy();
      fs.rmSync(newPath, { recursive: true, force: true });
    });

    it('should take the suffixed name when the new name is taken, as creation would', async () => {
      const holder = await db.organization.create({ name: `Taken-${uniqueId}` });
      await sync(renamer, [{ uuid: renameUuid, name: `Taken ${uniqueId}`, roles: ['owner'] }]);
      expect((await orgByUuid(renameUuid)).name).toBe(
        `Taken-${uniqueId}-${renameUuid.slice(0, 6)}`
      );
      await holder.destroy();
    });

    it('should step past a reserved path segment when the new name is one', async () => {
      await sync(renamer, [{ uuid: renameUuid, name: 'Search', roles: ['owner'] }]);
      const mirrored = await orgByUuid(renameUuid);
      expect(mirrored.name).toBe(`Search-${renameUuid.slice(0, 6)}`);
      expect(mirrored.display_name).toBe('Search');
    });

    it('should keep the name while a directory holding entries stands under the new one', async () => {
      const blocked = `Blocked-${uniqueId}`;
      const blockedPath = getSecureBoxPath(blocked);
      const currentPath = getSecureBoxPath(`Search-${renameUuid.slice(0, 6)}`);
      fs.mkdirSync(currentPath, { recursive: true });
      fs.mkdirSync(blockedPath, { recursive: true });
      fs.writeFileSync(path.join(blockedPath, 'stray.txt'), 'x');

      await sync(renamer, [{ uuid: renameUuid, name: `Blocked ${uniqueId}`, roles: ['owner'] }]);

      const mirrored = await orgByUuid(renameUuid);
      expect(mirrored.name).toBe(`Search-${renameUuid.slice(0, 6)}`);
      expect(mirrored.display_name).toBe(`Blocked ${uniqueId}`);
      expect(fs.existsSync(path.join(blockedPath, 'stray.txt'))).toBe(true);

      fs.rmSync(blockedPath, { recursive: true, force: true });
      fs.rmSync(currentPath, { recursive: true, force: true });
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
      preferences: { language: 'es', mode: 'dark', theme: 'lcars', motion: 'reduce' },
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
      expect(created.preferredMode).toBe('dark');
      expect(created.preferredTheme).toBe('lcars');
      expect(created.preferredMotion).toBe('reduce');
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
          preferences: { language: 'en', mode: 'light', theme: 'prominic', motion: 'auto' },
          zoneinfo: 'America/Chicago',
        },
        db,
        authConfig
      );
      expect(returning.name).toBe('Fresher Person');
      expect(returning.avatar_url).toBe('https://cdn.example/fresher.png');
      expect(returning.preferredLanguage).toBe('en');
      expect(returning.preferredMode).toBe('light');
      expect(returning.preferredTheme).toBe('prominic');
      expect(returning.preferredMotion).toBe('auto');
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

    it('should apply the preferences object as full desired state, a malformed member clearing', async () => {
      const returning = await externalUserHandler.handleExternalUser(
        PROVIDER,
        { ...baseProfile, preferences: { mode: 'dark', theme: 'Not A Theme', motion: 'none' } },
        db,
        authConfig
      );
      expect(returning.preferredMode).toBe('dark');
      expect(returning.preferredTheme).toBeNull();
      expect(returning.preferredMotion).toBeNull();
    });

    it('should clear the look when the identity provider carries nulls, and keep it when the object is absent', async () => {
      const set = await externalUserHandler.handleExternalUser(
        PROVIDER,
        { ...baseProfile, preferences: { mode: 'dark', theme: 'lcars', motion: 'reduce' } },
        db,
        authConfig
      );
      expect(set.preferredTheme).toBe('lcars');

      const { preferences, ...withoutObject } = baseProfile;
      void preferences;
      const kept = await externalUserHandler.handleExternalUser(
        PROVIDER,
        withoutObject,
        db,
        authConfig
      );
      expect(kept.preferredMode).toBe('dark');
      expect(kept.preferredTheme).toBe('lcars');
      expect(kept.preferredMotion).toBe('reduce');

      const cleared = await externalUserHandler.handleExternalUser(
        PROVIDER,
        { ...baseProfile, preferences: { mode: null, theme: null, motion: null } },
        db,
        authConfig
      );
      expect(cleared.preferredMode).toBeNull();
      expect(cleared.preferredTheme).toBeNull();
      expect(cleared.preferredMotion).toBeNull();
    });

    it('should provision a guest from the organizations claim', async () => {
      const guestEmail = `guest-${uniqueId}@example.com`;
      const guest = await externalUserHandler.handleExternalUser(
        PROVIDER,
        {
          iss: ISSUER,
          sub: guestEmail,
          UUID: `guest-uuid-${uniqueId}`,
          email: guestEmail,
          email_verified: true,
          organizations: [
            { uuid: `guest-org-${uniqueId}`, name: 'Guest Org', roles: ['GUEST'], primary: true },
          ],
        },
        db,
        authConfig
      );
      const membership = await membershipOf(guest, `guest-org-${uniqueId}`);
      expect(membership.role).toBe('guest');
      expect(membership.is_primary).toBe(true);
      expect(guest.primary_organization_id).toBe((await orgByUuid(`guest-org-${uniqueId}`)).id);
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
          preferences: { mode: 'neon' },
        },
        db,
        authConfig
      );
      expect(linked.id).toBe(user.id);
      expect(linked.authProvider).toBe('oidc');
      expect(linked.preferredMode).toBeNull();
      expect(await db.credential.count({ where: { user_id: user.id, provider: ISSUER } })).toBe(1);
    });
  });
});
