import request from 'supertest';
import app from '../server.js';

const FORMS = [
  'login',
  'register',
  'displayName',
  'profile',
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
  'download',
  'release',
  'patch',
  'downloadFile',
  'boxFile',
  'isoFile',
  'bulkItem',
  'bulkVersion',
  'bulkPatch',
  'bulkLeaf',
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
      'guest',
      'member',
      'admin',
      'owner',
      'superadmin',
    ]);
  });

  it('should enumerate the access modes', () => {
    expect(document.forms.accessMode.properties.access_mode.enum).toEqual([
      'private',
      'invite',
      'request',
    ]);
    expect(document.forms.accessMode.properties.default_role.enum).toEqual([
      'member',
      'admin',
      'guest',
    ]);
  });

  it('should name the scope of every unique member', () => {
    expect(document.forms.register.properties.username.unique).toBe('global');
    expect(document.forms.organization.properties.organization.unique).toBe('global');
    expect(document.forms.box.properties.name.unique).toBe('organization');
    expect(document.forms.version.properties.version_number.unique).toBe('box');
    expect(document.forms.provider.properties.name.unique).toBe('version');
    expect(document.forms.architecture.properties.name.unique).toBe('provider');
    expect(document.forms.download.properties.name.unique).toBe('organization');
    expect(document.forms.release.properties.version_number.unique).toBe('download');
    expect(document.forms.patch.properties.name.unique).toBe('release');
    expect(document.forms.downloadFile.properties.key.unique).toBe('patch');
    expect(document.forms.patch.properties.released_at.format).toBe('date');
    expect(document.forms.download.properties.icon_url.format).toBe('uri');
    ['box', 'iso', 'download', 'version', 'release', 'patch'].forEach(form => {
      expect(document.forms[form].properties.is_public).toEqual({ type: 'boolean' });
      expect(document.forms[form].properties.guest_access).toEqual({ type: 'boolean' });
      expect(document.forms[form].properties.published).toEqual({ type: 'boolean' });
    });
    [
      'box',
      'iso',
      'download',
      'version',
      'release',
      'patch',
      'provider',
      'architecture',
      'bulkItem',
      'bulkVersion',
      'bulkPatch',
      'bulkLeaf',
    ].forEach(form => {
      expect(document.forms[form].properties.recursive).toEqual({ type: 'boolean' });
    });
    ['downloadFile', 'boxFile', 'isoFile'].forEach(form => {
      expect(Object.hasOwn(document.forms[form].properties, 'recursive')).toBe(false);
    });
    expect(document.forms.patch.properties.kind.enum).toEqual([
      'release',
      'fixpack',
      'interim-fix',
      'hotfix',
    ]);
    expect(Object.hasOwn(document.forms.version, 'dependentRequired')).toBe(false);
    expect(document.forms.version.if).toEqual({
      properties: { deprecated: { const: true } },
      required: ['deprecated'],
    });
    expect(document.forms.version.then).toEqual({ required: ['deprecation_reason'] });
  });

  it('should carry one bulk form per level shape', () => {
    const words = [
      'make_public',
      'make_private',
      'publish',
      'unpublish',
      'allow_guests',
      'deny_guests',
    ];
    expect(document.forms.bulkItem.properties.action.enum).toEqual([
      'delete',
      'set',
      'reconcile',
      ...words,
    ]);
    expect(document.forms.bulkVersion.properties.action.enum).toEqual([
      'delete',
      'deprecate',
      'set',
      'move',
      'reconcile',
      ...words,
    ]);
    expect(document.forms.bulkPatch.properties.action.enum).toEqual([
      'delete',
      'set',
      'move',
      'reconcile',
      ...words,
    ]);
    expect(document.forms.bulkLeaf.properties.action.enum).toEqual([
      'delete',
      'set',
      'move',
      ...words,
    ]);
    ['bulkItem', 'bulkVersion', 'bulkPatch', 'bulkLeaf'].forEach(form => {
      expect(document.forms[form].required).toEqual(['action', 'names']);
      expect(document.forms[form].properties.names.minItems).toBe(1);
      expect(document.forms[form].properties.values.type).toBe('object');
    });
    expect(Object.keys(document.forms.bulkItem.properties.values.properties)).toEqual([
      'description',
      'family',
      'vendor',
      'docs_url',
      'notes_url',
      'icon_url',
    ]);
    expect(Object.keys(document.forms.bulkLeaf.properties.values.properties)).toEqual([
      'kind',
      'platform',
      'architecture',
      'language',
      'variant',
    ]);
    expect(document.forms.bulkVersion.properties.download.$ref).toBe('#/$defs/slug');
    expect(document.forms.bulkPatch.properties.release.$ref).toBe('#/$defs/identifier');
    expect(document.forms.bulkLeaf.properties.patch.$ref).toBe('#/$defs/identifier');
    expect(document.forms.downloadFile.properties.download.$ref).toBe('#/$defs/slug');
    expect(document.forms.patch.properties.release.$ref).toBe('#/$defs/identifier');
    expect(document.forms.bulkVersion.if).toEqual({
      properties: { action: { const: 'deprecate' } },
      required: ['action'],
    });
    expect(document.forms.bulkVersion.then).toEqual({ required: ['deprecation_reason'] });
    ['bulkItem', 'bulkPatch', 'bulkLeaf'].forEach(form => {
      expect(document.forms[form].if).toEqual({
        properties: { action: { const: 'set' } },
        required: ['action'],
      });
      expect(document.forms[form].then).toEqual({ required: ['values'] });
    });
  });
});
