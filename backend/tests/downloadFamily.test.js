import request from 'supertest';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import app from '../server.js';
import db from '../app/models/index.js';
import { getSecureDownloadPath } from '../app/controllers/download/helpers.js';

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

describe('Download family API', () => {
  const uniqueId = Date.now().toString(36);
  const orgName = `FamilyOrg_${uniqueId}`;
  const familyBase = `/api/organization/${orgName}/download-family`;
  const productBase = `/api/organization/${orgName}/download`;
  let org;
  let owner;
  let guest;
  let outsider;
  let ownerToken;
  let guestToken;
  let outsiderToken;

  const signFor = account =>
    jwt.sign({ id: account.id }, 'test-secret', { expiresIn: '1h', ...TEST_JWT_CLAIMS });

  const createUser = async (label, orgRole) => {
    const account = await db.user.create({
      username: `${label}-${uniqueId}`,
      email: `${label}-${uniqueId}@example.com`,
      password: 'password',
      verified: true,
    });
    const role = await db.role.findOne({ where: { name: 'user' } });
    await account.setRoles([role]);
    if (orgRole) {
      await db.UserOrg.create({ user_id: account.id, organization_id: org.id, role: orgRole });
    }
    return account;
  };

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    org = await db.organization.create({ name: orgName, access_mode: 'private' });
    owner = await createUser('fam-owner', 'owner');
    guest = await createUser('fam-guest', 'guest');
    outsider = await createUser('fam-outsider', null);
    ownerToken = signFor(owner);
    guestToken = signFor(guest);
    outsiderToken = signFor(outsider);
  });

  afterAll(async () => {
    await db.download.destroy({ where: { organizationId: org.id } });
    await db.downloadFamilies.destroy({ where: { organizationId: org.id } });
    await org.destroy();
    await db.user.destroy({ where: { id: [owner.id, guest.id, outsider.id] } });
    fs.rmSync(getSecureDownloadPath(orgName), { recursive: true, force: true });
  });

  it('should create a family, refuse a duplicate and a bad link, and list it with its product count', async () => {
    const res = await request(app).post(familyBase).set('x-access-token', ownerToken).send({
      name: 'HCL Domino',
      description: 'The Domino platform',
      vendor: 'HCL',
      docs_url: 'https://help.hcl-software.com/domino',
      icon_url: 'https://x.example/domino.svg',
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.name).toBe('HCL Domino');
    expect(res.body.vendor).toBe('HCL');
    expect(res.body.docs_url).toBe('https://help.hcl-software.com/domino');
    expect(res.body.icon_url).toBe('https://x.example/domino.svg');
    expect(res.body.notes_url).toBeNull();
    expect(res.body.products).toBe(0);

    const duplicate = await request(app)
      .post(familyBase)
      .set('x-access-token', ownerToken)
      .send({ name: 'HCL Domino' });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.body.errors).toEqual([
      expect.objectContaining({ pointer: '/name', rule: 'unique', params: { scope: orgName } }),
    ]);

    const badLink = await request(app)
      .post(familyBase)
      .set('x-access-token', ownerToken)
      .send({ name: 'Bad', docs_url: 'not a uri' });
    expect(badLink.statusCode).toBe(422);
    expect(badLink.body.errors).toEqual([
      expect.objectContaining({ pointer: '/docs_url', rule: 'format' }),
    ]);

    const asGuest = await request(app)
      .post(familyBase)
      .set('x-access-token', guestToken)
      .send({ name: 'Guest Family' });
    expect(asGuest.statusCode).toBe(403);
    const asOutsider = await request(app)
      .post(familyBase)
      .set('x-access-token', outsiderToken)
      .send({ name: 'Outsider Family' });
    expect(asOutsider.statusCode).toBe(403);

    await request(app)
      .post(productBase)
      .set('x-access-token', ownerToken)
      .send({ name: 'domino', family: 'HCL Domino', published: true })
      .expect(201);
    await request(app)
      .post(productBase)
      .set('x-access-token', ownerToken)
      .send({
        name: 'traveler',
        family: 'HCL Domino',
        vendor: 'HCL Traveler Team',
        icon_url: 'https://x.example/traveler.svg',
        published: true,
      })
      .expect(201);

    const list = await request(app).get(familyBase).set('x-access-token', ownerToken);
    expect(list.statusCode).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].products).toBe(2);
  });

  it('should fill a product with the family members wherever its own are empty', async () => {
    const inherited = await request(app)
      .get(`${productBase}/domino`)
      .set('x-access-token', ownerToken);
    expect(inherited.statusCode).toBe(200);
    expect(inherited.body.vendor).toBe('HCL');
    expect(inherited.body.docs_url).toBe('https://help.hcl-software.com/domino');
    expect(inherited.body.icon_url).toBe('https://x.example/domino.svg');
    expect(inherited.body.notes_url).toBeNull();
    expect(inherited.body.family_details).toEqual({
      name: 'HCL Domino',
      description: 'The Domino platform',
      vendor: 'HCL',
      docs_url: 'https://help.hcl-software.com/domino',
      notes_url: null,
      icon_url: 'https://x.example/domino.svg',
    });

    const overridden = await request(app)
      .get(`${productBase}/traveler`)
      .set('x-access-token', ownerToken);
    expect(overridden.body.vendor).toBe('HCL Traveler Team');
    expect(overridden.body.icon_url).toBe('https://x.example/traveler.svg');
    expect(overridden.body.docs_url).toBe('https://help.hcl-software.com/domino');

    const listed = await request(app).get(productBase).set('x-access-token', ownerToken);
    const domino = listed.body.find(entry => entry.name === 'domino');
    expect(domino.vendor).toBe('HCL');
    expect(domino.family_details.name).toBe('HCL Domino');

    const stored = await db.download.findOne({ where: { name: 'domino', organizationId: org.id } });
    expect(stored.vendor).toBeNull();
  });

  it('should rename a family and carry its products along, then delete it', async () => {
    const renamed = await request(app)
      .put(`${familyBase}/HCL%20Domino`)
      .set('x-access-token', ownerToken)
      .send({ name: 'HCL Domino Platform', notes_url: 'https://x.example/notes', docs_url: '' });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.body.name).toBe('HCL Domino Platform');
    expect(renamed.body.notes_url).toBe('https://x.example/notes');
    expect(renamed.body.docs_url).toBeNull();
    expect(renamed.body.products).toBe(2);

    const product = await request(app)
      .get(`${productBase}/domino`)
      .set('x-access-token', ownerToken);
    expect(product.body.family).toBe('HCL Domino Platform');
    expect(product.body.notes_url).toBe('https://x.example/notes');
    expect(product.body.docs_url).toBeNull();

    const gone = await request(app)
      .get(`${familyBase}/HCL%20Domino`)
      .set('x-access-token', ownerToken);
    expect(gone.statusCode).toBe(404);

    const asGuest = await request(app)
      .delete(`${familyBase}/HCL%20Domino%20Platform`)
      .set('x-access-token', guestToken);
    expect(asGuest.statusCode).toBe(403);

    const removed = await request(app)
      .delete(`${familyBase}/HCL%20Domino%20Platform`)
      .set('x-access-token', ownerToken);
    expect(removed.statusCode).toBe(200);

    const orphan = await request(app)
      .get(`${productBase}/domino`)
      .set('x-access-token', ownerToken);
    expect(orphan.body.family).toBe('HCL Domino Platform');
    expect(orphan.body.vendor).toBeNull();
    expect(orphan.body).not.toHaveProperty('family_details');
  });
});
