import { jest } from '@jest/globals';
import { validateValue, validateObject, isVisible, scopesFor } from '../app/utils/validation.js';
import { validateBody } from '../app/middleware/validate.js';
import { problem, refuse, conflict } from '../app/utils/problem.js';

const DOCUMENT = {
  $defs: {
    slug: {
      type: 'string',
      allOf: [{ pattern: '^[A-Za-z0-9.-]+$' }, { not: { pattern: '\\.\\.' } }],
      minLength: 1,
    },
  },
};

const buildRequest = body => ({
  body,
  __: (key, replacements = {}) =>
    `${key}${Object.keys(replacements).length ? `:${JSON.stringify(replacements)}` : ''}`,
});

const buildResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.type = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

describe('validateValue', () => {
  it('should report a missing required value once and let an optional absence pass', () => {
    expect(validateValue({ type: 'string', required: true }, undefined)).toEqual([
      { pointer: '', rule: 'required', params: {} },
    ]);
    expect(validateValue({ type: 'string', required: true }, null)).toEqual([
      { pointer: '', rule: 'required', params: {} },
    ]);
    expect(validateValue({ type: 'string' }, undefined)).toEqual([]);
  });

  it('should judge a blank string by minLength and the nonBlank pattern, never by required', () => {
    const rule = { type: 'string', required: true, minLength: 1, pattern: '\\S' };
    expect(validateValue({ type: 'string', required: true }, '   ')).toEqual([]);
    expect(validateValue(rule, '')).toEqual([
      { pointer: '', rule: 'pattern', params: { pattern: 'nonBlank' } },
    ]);
    expect(validateValue(rule, '   ')).toEqual([
      { pointer: '', rule: 'pattern', params: { pattern: 'nonBlank' } },
    ]);
    expect(validateValue(rule, ' x ')).toEqual([]);
    expect(
      validateValue({ $ref: '#/$defs/slug', minLength: 1, pattern: '\\S' }, '  ', DOCUMENT)
    ).toEqual([{ pointer: '', rule: 'pattern', params: { pattern: 'nonBlank' } }]);
    expect(
      validateValue({ $ref: '#/$defs/slug', minLength: 1, pattern: '\\S' }, 'bad_name', DOCUMENT)
    ).toEqual([{ pointer: '', rule: 'pattern', params: { pattern: 'slug' } }]);
  });

  it('should evaluate the type before anything else', () => {
    expect(validateValue({ type: 'integer', minimum: 1 }, 'x')).toEqual([
      { pointer: '', rule: 'type', params: { type: 'integer' } },
    ]);
    expect(validateValue({ type: 'boolean' }, 'true')).toEqual([
      { pointer: '', rule: 'type', params: { type: 'boolean' } },
    ]);
    expect(validateValue({ type: 'integer' }, '42')).toEqual([]);
  });

  it('should name a pattern by its $defs entry from any branch of its allOf', () => {
    expect(validateValue({ $ref: '#/$defs/slug' }, 'bad..name', DOCUMENT)).toEqual([
      { pointer: '', rule: 'pattern', params: { pattern: 'slug' } },
    ]);
    expect(validateValue({ $ref: '#/$defs/slug' }, 'bad_name', DOCUMENT)).toEqual([
      { pointer: '', rule: 'pattern', params: { pattern: 'slug' } },
    ]);
    expect(validateValue({ $ref: '#/$defs/slug' }, 'good.name', DOCUMENT)).toEqual([]);
    expect(validateValue({ $ref: '#/$defs/slug', maxLength: 3 }, 'good', DOCUMENT)).toEqual([
      { pointer: '', rule: 'maxLength', params: { maxLength: 3 } },
    ]);
  });

  it('should evaluate allOf and not outside a named pattern', () => {
    const rule = { type: 'string', allOf: [{ minLength: 2 }, { not: { enum: ['no'] } }] };
    expect(validateValue(rule, 'x')).toEqual([
      { pointer: '', rule: 'minLength', params: { minLength: 2 } },
    ]);
    expect(validateValue(rule, 'no')).toEqual([{ pointer: '', rule: 'not', params: {} }]);
    expect(validateValue(rule, 'yes')).toEqual([]);
  });

  it('should evaluate lengths, bounds, enums, formats and item counts', () => {
    expect(validateValue({ type: 'string', minLength: 3 }, 'ab')).toEqual([
      { pointer: '', rule: 'minLength', params: { minLength: 3 } },
    ]);
    expect(validateValue({ type: 'integer', minimum: 1, maximum: 10 }, 11)).toEqual([
      { pointer: '', rule: 'maximum', params: { maximum: 10 } },
    ]);
    expect(validateValue({ type: 'integer', minimum: 1, maximum: 10 }, 0)).toEqual([
      { pointer: '', rule: 'minimum', params: { minimum: 1 } },
    ]);
    expect(validateValue({ type: 'integer', minimum: 1 }, 0)).toEqual([
      { pointer: '', rule: 'minimum', params: { minimum: 1 } },
    ]);
    expect(validateValue({ type: 'integer', maximum: 5 }, 6)).toEqual([
      { pointer: '', rule: 'maximum', params: { maximum: 5 } },
    ]);
    expect(validateValue({ type: 'string', format: 'uri', enum: ['a'] }, '')).toEqual([]);
    expect(validateValue({ type: 'string', minLength: 1 }, '')).toEqual([
      { pointer: '', rule: 'minLength', params: { minLength: 1 } },
    ]);
    expect(validateValue({ type: 'string', enum: ['a', 'b'] }, 'c')).toEqual([
      { pointer: '', rule: 'enum', params: { enum: 'a, b' } },
    ]);
    expect(validateValue({ type: 'string', format: 'email' }, 'nope')).toEqual([
      { pointer: '', rule: 'format', params: { format: 'email' } },
    ]);
    expect(validateValue({ type: 'string', format: 'uri' }, 'https://ok.example')).toEqual([]);
    expect(validateValue({ type: 'string', format: 'hostname' }, 'bad host')).toEqual([
      { pointer: '', rule: 'format', params: { format: 'hostname' } },
    ]);
    expect(validateValue({ type: 'string', format: 'ipv4' }, '10.0.0.1')).toEqual([]);
    expect(validateValue({ type: 'array', minItems: 1 }, [])).toEqual([
      { pointer: '', rule: 'minItems', params: { minItems: 1 } },
    ]);
    expect(validateValue({ type: 'array', maxItems: 1 }, [1, 2])).toEqual([
      { pointer: '', rule: 'maxItems', params: { maxItems: 1 } },
    ]);
  });
});

describe('validateObject', () => {
  const schema = {
    type: 'object',
    required: ['name'],
    properties: {
      name: { $ref: '#/$defs/slug' },
      deprecated: { type: 'boolean' },
      deprecation_reason: { type: 'string', maxLength: 5 },
      sql: {
        type: 'object',
        required: ['host'],
        properties: {
          port: { type: 'integer', minimum: 1, maximum: 65535 },
          host: { type: 'string', dependsOn: 'dialect', showWhen: ['mysql'] },
          dialect: { type: 'string' },
        },
      },
      providers: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          required: ['issuer'],
          properties: { issuer: { type: 'string', format: 'uri' } },
        },
      },
      levels: { type: 'object', additionalProperties: { type: 'string', enum: ['info'] } },
    },
    dependentRequired: { deprecated: ['deprecation_reason'] },
  };

  it('should point at every failing member from the root', () => {
    const errors = validateObject(
      schema,
      {
        name: 'a..b',
        deprecated: true,
        sql: { port: 70000, dialect: 'mysql', host: '' },
        providers: { idp: { issuer: 'not a uri' }, other: {} },
        levels: { app: 'loud' },
      },
      DOCUMENT
    );
    expect(errors).toEqual([
      { pointer: '/name', rule: 'pattern', params: { pattern: 'slug' } },
      { pointer: '/deprecation_reason', rule: 'required', params: {} },
      { pointer: '/sql/port', rule: 'maximum', params: { maximum: 65535 } },
      { pointer: '/providers/idp/issuer', rule: 'format', params: { format: 'uri' } },
      { pointer: '/providers/other/issuer', rule: 'required', params: {} },
      { pointer: '/levels/app', rule: 'enum', params: { enum: 'info' } },
    ]);
  });

  it('should report a missing required member and skip a hidden one', () => {
    expect(validateObject(schema, { sql: { dialect: 'sqlite', host: '' } }, DOCUMENT)).toEqual([
      { pointer: '/name', rule: 'required', params: {} },
    ]);
    expect(validateObject(schema, { name: 'fine', deprecated: false }, DOCUMENT)).toEqual([]);
    const blank = { name: '', sql: { dialect: 'mysql', host: '' } };
    expect(validateObject(schema, blank, DOCUMENT)).toEqual([
      { pointer: '/name', rule: 'minLength', params: { minLength: 1 } },
    ]);
  });
});

describe('isVisible and scopesFor', () => {
  it('should resolve dependsOn in the nearest enclosing scope', () => {
    const values = { database_type: 'mysql', sql: { host: 'db' } };
    const scopes = scopesFor(values, '/sql/host');
    expect(scopes).toEqual([values, values.sql]);
    expect(isVisible({ dependsOn: 'database_type', showWhen: ['mysql'] }, scopes)).toBe(true);
    expect(isVisible({ dependsOn: 'database_type', showWhen: ['sqlite'] }, scopes)).toBe(false);
    expect(isVisible({ dependsOn: 'missing', showWhen: [true] }, scopes)).toBe(false);
    expect(isVisible({}, scopes)).toBe(true);
    const flags = [{ enabled: true, text: 'true' }];
    expect(isVisible({ dependsOn: 'enabled', showWhen: [true] }, flags)).toBe(true);
    expect(isVisible({ dependsOn: 'text', showWhen: [true] }, flags)).toBe(false);
  });
});

describe('validateBody', () => {
  it('should refuse a body that breaks a form with 422 and pointers', () => {
    const res = buildResponse();
    const next = jest.fn();
    validateBody('version')(buildRequest({ deprecated: true, release_notes: 5 }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.type).toHaveBeenCalledWith('application/problem+json');
    const [[body]] = res.send.mock.calls;
    expect(body.type).toBe('https://auth.startcloud.com/probs/validation');
    expect(body.title).toBe('problems.validation');
    expect(body.errors.map(error => [error.pointer, error.rule])).toEqual([
      ['/version_number', 'required'],
      ['/release_notes', 'type'],
      ['/deprecation_reason', 'required'],
    ]);
    expect(body.errors[1].detail).toBe('validation.type:{"field":"release_notes","type":"string"}');
  });

  it('should refuse a blank required member as nonBlank', () => {
    const res = buildResponse();
    const next = jest.fn();
    validateBody('login')(buildRequest({ username: '   ', password: '' }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    const [[body]] = res.send.mock.calls;
    expect(body.errors).toEqual([
      expect.objectContaining({
        pointer: '/username',
        rule: 'pattern',
        params: { pattern: 'nonBlank' },
      }),
      expect.objectContaining({
        pointer: '/password',
        rule: 'pattern',
        params: { pattern: 'nonBlank' },
      }),
    ]);
  });

  it('should demand a deprecation reason only while deprecated is true', () => {
    const next = jest.fn();
    validateBody('version', { partial: true })(
      buildRequest({ deprecated: false }),
      buildResponse(),
      next
    );
    expect(next).toHaveBeenCalledTimes(1);
    const res = buildResponse();
    validateBody('version', { partial: true })(buildRequest({ deprecated: true }), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(422);
    const [[body]] = res.send.mock.calls;
    expect(body.errors).toEqual([
      expect.objectContaining({ pointer: '/deprecation_reason', rule: 'required' }),
    ]);
  });

  it('should let a valid body through and drop required on a partial form', () => {
    const next = jest.fn();
    validateBody('version')(buildRequest({ version_number: '1.0.0' }), buildResponse(), next);
    expect(next).toHaveBeenCalledTimes(1);
    validateBody('version', { partial: true })(
      buildRequest({ description: 'only this' }),
      buildResponse(),
      next
    );
    expect(next).toHaveBeenCalledTimes(2);
    validateBody('login')(buildRequest(undefined), buildResponse(), next);
    expect(next).toHaveBeenCalledTimes(2);
  });
});

describe('problem, refuse and conflict', () => {
  it('should answer 409 conflict when every failing rule is unique', () => {
    const res = buildResponse();
    conflict(res, buildRequest({}), '/name', 'organization');
    expect(res.status).toHaveBeenCalledWith(409);
    const [[body]] = res.send.mock.calls;
    expect(body).toEqual({
      type: 'https://auth.startcloud.com/probs/conflict',
      title: 'problems.conflict',
      status: 409,
      errors: [
        {
          pointer: '/name',
          rule: 'unique',
          params: { scope: 'organization' },
          detail: 'validation.unique:{"field":"name","scope":"organization"}',
        },
      ],
    });
  });

  it('should answer 422 validation with a custom title when a rule is not unique', () => {
    const res = buildResponse();
    refuse(
      res,
      buildRequest({}),
      [
        { pointer: '/a', rule: 'unique', params: { scope: 'global' } },
        { pointer: '/b', rule: 'minLength', params: { minLength: 3 } },
      ],
      'Custom title'
    );
    expect(res.status).toHaveBeenCalledWith(422);
    const [[body]] = res.send.mock.calls;
    expect(body.title).toBe('Custom title');
    expect(body.errors).toHaveLength(2);
  });

  it('should send any problem type with its own detail kept', () => {
    const res = buildResponse();
    problem(res, buildRequest({}), {
      status: 400,
      type: 'bad-request',
      errors: [{ pointer: '', rule: 'json', detail: 'Unexpected token' }],
    });
    expect(res.status).toHaveBeenCalledWith(400);
    const [[body]] = res.send.mock.calls;
    expect(body.type).toBe('https://auth.startcloud.com/probs/bad-request');
    expect(body.title).toBe('problems.badRequest');
    expect(body.errors[0]).toEqual({
      pointer: '',
      rule: 'json',
      params: {},
      detail: 'Unexpected token',
    });
  });
});
