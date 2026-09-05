import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../server.js';
import db from '../app/models/index.js';

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };
const DAY_MS = 24 * 60 * 60 * 1000;

describe('Accepting an organization invitation', () => {
  const uniqueId = Date.now().toString(36);
  const orgName = `AcceptOrg-${uniqueId}`;
  const otherOrgName = `AcceptOther-${uniqueId}`;
  let org;
  let otherOrg;
  let inviter;
  let invitee;
  let stranger;
  let inviteeToken;
  let strangerToken;

  const signFor = account =>
    jwt.sign({ id: account.id }, 'test-secret', { expiresIn: '1h', ...TEST_JWT_CLAIMS });

  const createUser = async label => {
    const account = await db.user.create({
      username: `${label}-${uniqueId}`,
      email: `${label}-${uniqueId}@example.com`,
      password: 'password',
      verified: true,
    });
    const role = await db.role.findOne({ where: { name: 'user' } });
    await account.setRoles([role]);
    return account;
  };

  const createInvitation = (overrides = {}) =>
    db.invitation.create({
      email: invitee.email,
      token: `tok-${uniqueId}-${Math.random().toString(36).slice(2)}`,
      expires: new Date(Date.now() + DAY_MS),
      organizationId: org.id,
      invited_role: 'admin',
      invited_by: inviter.id,
      ...overrides,
    });

  const accept = (token, sessionToken) =>
    request(app).post(`/api/auth/invitations/${token}/accept`).set('x-access-token', sessionToken);

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    org = await db.organization.create({ name: orgName });
    otherOrg = await db.organization.create({ name: otherOrgName });
    inviter = await createUser('accept-inviter');
    invitee = await createUser('accept-invitee');
    stranger = await createUser('accept-stranger');
    await db.credential.create({
      user_id: inviter.id,
      provider: 'https://accept-idp.example',
      subject: `inviter-${uniqueId}`,
      external_email: inviter.email,
    });
    await db.UserOrg.create({ user_id: inviter.id, organization_id: org.id, role: 'owner' });
    inviteeToken = signFor(invitee);
    strangerToken = signFor(stranger);
  });

  afterAll(async () => {
    await db.invitation.destroy({ where: { organizationId: [org.id, otherOrg.id] } });
    await db.invitation.destroy({ where: { email: invitee.email } });
    await db.organization.destroy({ where: { id: [org.id, otherOrg.id] } });
    await db.user.destroy({ where: { id: [inviter.id, invitee.id, stranger.id] } });
  });

  it('should answer 404 for an unknown token', async () => {
    const res = await accept('no-such-token', inviteeToken);
    expect(res.statusCode).toBe(404);
  });

  it('should answer 404 for an invitation past its expiry', async () => {
    const invitation = await createInvitation({ expires: new Date(Date.now() - DAY_MS) });
    const res = await accept(invitation.token, inviteeToken);
    expect(res.statusCode).toBe(404);
  });

  it('should answer 404 for an invitation flagged expired', async () => {
    const invitation = await createInvitation({ expired: true });
    const res = await accept(invitation.token, inviteeToken);
    expect(res.statusCode).toBe(404);
  });

  it('should refuse an account whose email differs from the invited one', async () => {
    const invitation = await createInvitation();
    const res = await accept(invitation.token, strangerToken);
    expect(res.statusCode).toBe(403);
    await invitation.reload();
    expect(invitation.accepted).toBe(false);
  });

  it('should answer 404 when the invitation points at no organization', async () => {
    const invitation = await createInvitation({ organizationId: null });
    const res = await accept(invitation.token, inviteeToken);
    expect(res.statusCode).toBe(404);
  });

  it('should add the member with the invited role and consume the invitation', async () => {
    const invitation = await createInvitation();
    const res = await accept(invitation.token, inviteeToken);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ organization: orgName, role: 'admin' });

    const membership = await db.UserOrg.findUserOrgRole(invitee.id, org.id);
    expect(membership.role).toBe('admin');
    expect(membership.is_primary).toBe(false);
    await invitation.reload();
    expect(invitation.accepted).toBe(true);
    expect(invitation.accepted_at).not.toBeNull();
  });

  it('should consume a redundant invitation for an existing member', async () => {
    const invitation = await createInvitation();
    const res = await accept(invitation.token, inviteeToken);
    expect(res.statusCode).toBe(409);
    await invitation.reload();
    expect(invitation.accepted).toBe(true);
  });

  it('should accept an invitation nobody signed', async () => {
    const invitation = await createInvitation({
      organizationId: otherOrg.id,
      invited_role: 'member',
      invited_by: null,
    });
    const res = await accept(invitation.token, inviteeToken);
    expect(res.statusCode).toBe(200);
    expect(res.body.role).toBe('member');
  });
});
