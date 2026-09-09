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
      [
        'slug',
        'identifier',
        'email',
        'orgCode',
        'providerName',
        'hex',
        'watchId',
        'personName',
        'iconName',
        'languageTag',
        'timezone',
      ].sort()
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
    expect(document.$defs.email.pattern).toBe(
      "^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$"
    );
    expect(document.$defs.email.maxLength).toBe(255);
    expect(Object.hasOwn(document.$defs.email, 'format')).toBe(false);
    expect(document.$defs.watchId.pattern).toBe('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$');
    expect(document.$defs.iconName.pattern).toBe('^[a-z0-9 -]{1,64}$');
    expect(document.$defs.languageTag).toEqual({
      type: 'string',
      pattern: '^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$',
      maxLength: 10,
    });
    expect(document.$defs.timezone.pattern).toBe('^(?:UTC|[A-Za-z_]+(?:/[A-Za-z0-9_+-]+)+)$');
    Object.values(document.forms).forEach(form => {
      Object.values(form.properties).forEach(property => {
        expect(Object.hasOwn(property, 'format') && property.format === 'email').toBe(false);
        if (Object.hasOwn(property, 'pattern')) {
          expect(property.pattern).toBe('\\S');
        }
        if (property.$ref) {
          expect(property.$ref.startsWith('#/$defs/')).toBe(true);
          expect(document.$defs[property.$ref.slice('#/$defs/'.length)]).toBeDefined();
        }
      });
    });
  });

  it('should refuse a blank string on every required string member by rule', () => {
    Object.values(document.forms).forEach(form => {
      (form.required || []).forEach(name => {
        const property = form.properties[name];
        const target = property.$ref ? document.$defs[property.$ref.slice('#/$defs/'.length)] : {};
        const type = property.type || target.type;
        if (type !== 'string') {
          return;
        }
        expect(property.minLength).toBeGreaterThanOrEqual(1);
        if (property.$ref === '#/$defs/email') {
          expect(Object.hasOwn(property, 'pattern')).toBe(false);
          return;
        }
        expect(property.pattern).toBe('\\S');
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
    expect(Object.hasOwn(document.forms.version, 'dependentRequired')).toBe(false);
    expect(document.forms.version.if).toEqual({
      properties: { deprecated: { const: true } },
      required: ['deprecated'],
    });
    expect(document.forms.version.then).toEqual({ required: ['deprecation_reason'] });
  });
});
