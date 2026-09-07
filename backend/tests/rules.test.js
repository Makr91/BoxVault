import request from 'supertest';
import app from '../server.js';

const FORMS = [
  'login',
  'register',
  'displayName',
  'password',
  'email',
  'serviceAccount',
  'organization',
  'accessMode',
  'invitation',
  'joinRequest',
  'box',
  'iso',
  'version',
  'provider',
  'architecture',
];

describe('GET /api/rules', () => {
  let document;

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    const res = await request(app).get('/api/rules');
    expect(res.statusCode).toBe(200);
    document = res.body;
  });

  it('should answer one JSON Schema 2020-12 document without a token', () => {
    expect(document.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(Object.keys(document.$defs).sort()).toEqual(
      ['email', 'hex', 'identifier', 'orgCode', 'providerName', 'slug'].sort()
    );
    expect(Object.keys(document.forms).sort()).toEqual([...FORMS].sort());
  });

  it('should carry every pattern in $defs and reference it from the forms', () => {
    expect(document.$defs.slug.allOf).toEqual([
      { pattern: '^[A-Za-z0-9.-]+$' },
      { not: { pattern: '\\.\\.' } },
    ]);
    expect(document.$defs.identifier.allOf).toEqual([
      { pattern: '^[0-9a-zA-Z][0-9a-zA-Z._-]*$' },
      { not: { pattern: '\\.\\.' } },
    ]);
    expect(Object.hasOwn(document.$defs.slug, 'pattern')).toBe(false);
    expect(document.$defs.orgCode.pattern).toBe('^[0-9A-F]{6}$');
    Object.values(document.forms).forEach(form => {
      Object.values(form.properties).forEach(property => {
        expect(Object.hasOwn(property, 'pattern')).toBe(false);
        if (property.$ref) {
          expect(property.$ref.startsWith('#/$defs/')).toBe(true);
          expect(document.$defs[property.$ref.slice('#/$defs/'.length)]).toBeDefined();
        }
      });
    });
  });

  it('should read the password minimum from the auth configuration', () => {
    expect(document.forms.register.properties.password.minLength).toBe(6);
    expect(document.forms.register.properties.password.maxLength).toBe(128);
    expect(document.forms.password.properties.password.minLength).toBe(6);
    expect(document.forms.serviceAccount.properties.expiration_days.maximum).toBe(365);
    expect(document.forms.serviceAccount.properties.role.enum).toEqual([
      'member',
      'admin',
      'owner',
      'superadmin',
    ]);
  });

  it('should name the scope of every unique member', () => {
    expect(document.forms.register.properties.username.unique).toBe('global');
    expect(document.forms.organization.properties.organization.unique).toBe('global');
    expect(document.forms.box.properties.name.unique).toBe('organization');
    expect(document.forms.version.properties.version_number.unique).toBe('box');
    expect(document.forms.provider.properties.name.unique).toBe('version');
    expect(document.forms.architecture.properties.name.unique).toBe('provider');
    expect(document.forms.version.dependentRequired).toEqual({
      deprecated: ['deprecation_reason'],
    });
  });
});
