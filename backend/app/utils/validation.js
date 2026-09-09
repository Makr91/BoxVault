const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
const HOSTNAME_RE =
  /^(?=.{1,255}$)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
const IPV4_RE = /^(?:25[0-5]|2[0-4]\d|[01]?\d\d?)(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)){3}$/;
const INTEGER_RE = /^-?\d+$/;
const NUMBER_RE = /^-?\d+(?:\.\d+)?$/;
const NON_BLANK_PATTERN = '\\S';
const PATTERN_NAMES = { [NON_BLANK_PATTERN]: 'nonBlank' };

const isUri = value => {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

const FORMATS = {
  email: value => EMAIL_RE.test(value),
  uri: isUri,
  hostname: value => HOSTNAME_RE.test(value),
  ipv4: value => IPV4_RE.test(value),
};

const TYPE_CHECKS = {
  string: value => typeof value === 'string',
  integer: value =>
    typeof value === 'number' ? Number.isInteger(value) : INTEGER_RE.test(String(value)),
  number: value =>
    typeof value === 'number' ? Number.isFinite(value) : NUMBER_RE.test(String(value)),
  boolean: value => typeof value === 'boolean',
  array: value => Array.isArray(value),
  object: value => value !== null && typeof value === 'object' && !Array.isArray(value),
};

const isBlank = value => value === undefined || value === null;

const isPresent = value => !isBlank(value) && value !== false;

const refTarget = (ref, document) => {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) {
    return { target: null, name: '' };
  }
  const segments = ref.slice(2).split('/');
  const target = segments.reduce((node, segment) => (node ? node[segment] : undefined), document);
  return {
    target: target && typeof target === 'object' ? target : null,
    name: segments[0] === '$defs' ? segments[1] : '',
  };
};

const resolve = (schema, document) => {
  const { $ref, ...rest } = schema;
  if (!$ref) {
    return { rule: schema, patternName: '' };
  }
  const { target, name } = refTarget($ref, document);
  return { rule: { ...(target || {}), ...rest }, patternName: name };
};

const typeCheck = (rule, value) => {
  const check = TYPE_CHECKS[rule.type];
  return check && !check(value) ? { rule: 'type', params: { type: rule.type } } : null;
};

const nonBlankCheck = (rule, value) => {
  if (rule.pattern !== NON_BLANK_PATTERN || typeof value !== 'string' || /\S/.test(value)) {
    return null;
  }
  return { rule: 'pattern', params: { pattern: PATTERN_NAMES[NON_BLANK_PATTERN] } };
};

const lengthCheck = (rule, value) => {
  if (typeof value !== 'string') {
    return null;
  }
  if (rule.minLength !== undefined && value.length < rule.minLength) {
    return { rule: 'minLength', params: { minLength: rule.minLength } };
  }
  if (rule.maxLength !== undefined && value.length > rule.maxLength) {
    return { rule: 'maxLength', params: { maxLength: rule.maxLength } };
  }
  return null;
};

const patternCheck = (rule, value, patternName) => {
  if (typeof value !== 'string' || !rule.pattern || new RegExp(rule.pattern).test(value)) {
    return null;
  }
  return {
    rule: 'pattern',
    params: { pattern: patternName || PATTERN_NAMES[rule.pattern] || rule.pattern },
  };
};

const boundsCheck = (rule, value) => {
  const number = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(number) || (rule.minimum === undefined && rule.maximum === undefined)) {
    return null;
  }
  const below = rule.minimum !== undefined && number < rule.minimum;
  const above = rule.maximum !== undefined && number > rule.maximum;
  if (!below && !above) {
    return null;
  }
  const params = { minimum: rule.minimum, maximum: rule.maximum };
  if (rule.minimum !== undefined && rule.maximum !== undefined) {
    return { rule: 'range', params };
  }
  return { rule: below ? 'minimum' : 'maximum', params };
};

const enumCheck = (rule, value) => {
  if (!Array.isArray(rule.enum) || rule.enum.map(String).includes(String(value))) {
    return null;
  }
  return { rule: 'enum', params: { enum: rule.enum.join(', ') } };
};

const formatCheck = (rule, value) => {
  const check = FORMATS[rule.format];
  if (typeof value !== 'string' || !check || check(value)) {
    return null;
  }
  return { rule: 'format', params: { format: rule.format } };
};

const itemsCheck = (rule, value) => {
  if (!Array.isArray(value)) {
    return null;
  }
  if (rule.minItems !== undefined && value.length < rule.minItems) {
    return { rule: 'minItems', params: { minItems: rule.minItems } };
  }
  if (rule.maxItems !== undefined && value.length > rule.maxItems) {
    return { rule: 'maxItems', params: { maxItems: rule.maxItems } };
  }
  return null;
};

const CHECKS = [
  typeCheck,
  nonBlankCheck,
  lengthCheck,
  patternCheck,
  boundsCheck,
  enumCheck,
  formatCheck,
  itemsCheck,
];

const subschemaFailure = ({ schema, value, patternName, document, evaluate }) => {
  const inner = resolve(schema, document);
  return evaluate(inner.rule, value, inner.patternName || patternName, document);
};

const allOfCheck = ({ rule, value, patternName, document, evaluate }) => {
  for (const schema of rule.allOf || []) {
    const failure = subschemaFailure({ schema, value, patternName, document, evaluate });
    if (failure) {
      return failure;
    }
  }
  return null;
};

const notCheck = ({ rule, value, patternName, document, evaluate }) => {
  if (!rule.not) {
    return null;
  }
  const passed = !subschemaFailure({ schema: rule.not, value, patternName, document, evaluate });
  if (!passed) {
    return null;
  }
  return patternName
    ? { rule: 'pattern', params: { pattern: patternName } }
    : { rule: 'not', params: {} };
};

const firstFailure = (rule, value, patternName, document) => {
  for (const check of CHECKS) {
    const failure = check(rule, value, patternName);
    if (failure) {
      return failure;
    }
  }
  const nested = { rule, value, patternName, document, evaluate: firstFailure };
  return allOfCheck(nested) || notCheck(nested);
};

/**
 * Evaluate one value against one schema: `type`, `required` (presence
 * alone: undefined and null count as missing when the schema says
 * `required: true`, a blank string is judged by `minLength` and `pattern`),
 * `minLength`, `maxLength`, `pattern`, `minimum`, `maximum`, `enum`,
 * `format`, `minItems`, `maxItems`, `allOf` (every branch must pass) and
 * `not` (the branch must fail), with `$ref` resolved within `document`. A
 * failure anywhere inside a `$defs` pattern, its `allOf` and `not` branches
 * included, is reported as `pattern` named by the `$defs` entry; the inline
 * `\S` pattern of a required string is reported as `pattern` named
 * `nonBlank`.
 *
 * @param {Object} schema - The value's schema
 * @param {*} value - The value
 * @param {Object} [document] - The document `$ref` resolves in
 * @returns {Array<{ pointer: string, rule: string, params: Object }>} The first failing rule, or nothing
 */
const validateValue = (schema, value, document = {}) => {
  const { rule, patternName } = resolve(schema, document);
  if (isBlank(value)) {
    return rule.required === true ? [{ pointer: '', rule: 'required', params: {} }] : [];
  }
  const failure = firstFailure(rule, value, patternName, document);
  return failure ? [{ pointer: '', ...failure }] : [];
};

/**
 * Whether a property is evaluated: without `dependsOn` always, else while
 * the nearest enclosing object carrying the named key holds one of the
 * `showWhen` values.
 *
 * @param {Object} rule - The property's schema
 * @param {Array<Object>} scopes - The value objects from the root down to the property's parent
 * @returns {boolean}
 */
const isVisible = (rule, scopes) => {
  if (!rule.dependsOn) {
    return true;
  }
  const scope = [...scopes]
    .reverse()
    .find(entry => entry && typeof entry === 'object' && Object.hasOwn(entry, rule.dependsOn));
  const current = scope ? scope[rule.dependsOn] : undefined;
  return (rule.showWhen || []).map(String).includes(String(current));
};

/**
 * The value objects from the root down to the parent of a JSON Pointer, the
 * scopes `isVisible` resolves `dependsOn` in.
 *
 * @param {Object} values - The root object
 * @param {string} pointer - The property's JSON Pointer
 * @returns {Array<Object>}
 */
const scopesFor = (values, pointer) => {
  const scopes = [values];
  pointer
    .split('/')
    .filter(Boolean)
    .slice(0, -1)
    .forEach(segment => {
      const parent = scopes[scopes.length - 1];
      scopes.push(parent && typeof parent === 'object' ? parent[segment] : undefined);
    });
  return scopes;
};

const passesIf = (condition, values) =>
  Boolean(condition) &&
  (condition.required || []).every(name => !isBlank(values[name])) &&
  Object.entries(condition.properties || {}).every(
    ([name, rule]) => !Object.hasOwn(rule, 'const') || values[name] === rule.const
  );

const requiredOf = (schema, values) => {
  const required = new Set(schema.required || []);
  Object.entries(schema.dependentRequired || {}).forEach(([key, needs]) => {
    if (isPresent(values[key])) {
      needs.forEach(name => required.add(name));
    }
  });
  if (passesIf(schema.if, values)) {
    (schema.then?.required || []).forEach(name => required.add(name));
  }
  return required;
};

const walkMap = ({ item, values, scopes, base, document, errors, walk }) => {
  Object.entries(values && typeof values === 'object' ? values : {}).forEach(([key, entry]) => {
    const pointer = `${base}/${key}`;
    if (item.properties) {
      const child = entry || {};
      walk({
        schema: item,
        values: child,
        scopes: [...scopes, child],
        base: pointer,
        document,
        errors,
      });
      return;
    }
    validateValue(item, entry, document).forEach(error => errors.push({ ...error, pointer }));
  });
};

const walkObject = ({ schema, values, scopes, base, document, errors }) => {
  const required = requiredOf(schema, values);
  Object.entries(schema.properties || {}).forEach(([name, property]) => {
    const { rule } = resolve(property, document);
    if (!isVisible(rule, scopes)) {
      return;
    }
    const value = values[name];
    const pointer = `${base}/${name}`;
    if (rule.properties) {
      const child = value || {};
      const next = { schema: rule, values: child, scopes: [...scopes, child], base: pointer };
      walkObject({ ...next, document, errors });
      return;
    }
    if (rule.additionalProperties && typeof rule.additionalProperties === 'object') {
      const item = resolve(rule.additionalProperties, document).rule;
      const next = { item, values: value, scopes: [...scopes, value], base: pointer };
      walkMap({ ...next, document, errors, walk: walkObject });
      return;
    }
    const own = validateValue({ ...property, required: required.has(name) }, value, document);
    if (own.length > 0) {
      errors.push({ ...own[0], pointer });
    }
  });
};

/**
 * Evaluate an object against an object schema: `required`,
 * `dependentRequired`, `then.required` while the `if` subschema's `const`
 * and `required` entries hold, every property through `validateValue` (nested
 * objects and `additionalProperties` maps walked, pointers `/name`,
 * `/sql/port`), a property hidden by `dependsOn`/`showWhen` skipped.
 *
 * @param {Object} schema - The object schema
 * @param {Object} values - The object
 * @param {Object} [document] - The document `$ref` resolves in
 * @returns {Array<{ pointer: string, rule: string, params: Object }>} One entry per failing property
 */
const validateObject = (schema, values, document = {}) => {
  const errors = [];
  const root = values || {};
  walkObject({ schema, values: root, scopes: [root], base: '', document, errors });
  return errors;
};

export { validateValue, validateObject, isVisible, scopesFor };
