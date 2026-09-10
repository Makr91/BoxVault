import fs from 'fs';
import { dirname, join, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes, timingSafeEqual } from 'crypto';
import { load as parseYaml, dump as dumpYaml, CORE_SCHEMA } from 'js-yaml';
import { Router } from 'express';
import multer from 'multer';
import { validateObject } from '../utils/validation.js';
import { problem, refuse } from '../utils/problem.js';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const DEVELOPMENT_DIR = resolve(MODULE_DIR, '../../config');
const SETUP_TOKEN_FILE = 'setup.token';
const PROTOTYPE_KEYS = ['__proto__', 'constructor', 'prototype'];

const state = {
  configDir: '',
  development: false,
  names: [],
  schemaDir: '',
  hooks: {},
  schemas: new Map(),
  raw: new Map(),
  filled: new Map(),
  pending: new Map(),
  lastModifiedBy: null,
  lastModifiedTime: null,
  serviceUser: null,
};

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const isMapSchema = property => isPlainObject(property?.additionalProperties);

const isFreeSubtree = property =>
  property?.type === 'object' && !property.properties && !isMapSchema(property);

const escapeSegment = segment => String(segment).replace(/~/g, '~0').replace(/\//g, '~1');

const segmentsOf = pointer =>
  String(pointer || '')
    .split('/')
    .slice(1)
    .map(segment => segment.replace(/~1/g, '/').replace(/~0/g, '~'));

const line = (level, name, entry) => {
  process.stderr.write(`${JSON.stringify({ level, category: 'app', config: name, ...entry })}\n`);
};

const filePath = name =>
  join(state.configDir, state.development ? `${name}.dev.config.yaml` : `${name}.config.yaml`);

const setupTokenPath = () => join(state.configDir, SETUP_TOKEN_FILE);

const setupComplete = () => !fs.existsSync(setupTokenPath());

const hasDefaults = property =>
  Object.values(property.properties || {}).some(
    child => Object.hasOwn(child, 'default') || (child.properties && hasDefaults(child))
  );

const fillDefaults = (schema, config) => {
  const filled = { ...(isPlainObject(config) ? config : {}) };
  Object.entries(schema.properties || {}).forEach(([key, property]) => {
    const present = Object.hasOwn(filled, key);
    if (property.properties) {
      if (present || hasDefaults(property)) {
        filled[key] = fillDefaults(property, filled[key]);
      }
      return;
    }
    if (!present && Object.hasOwn(property, 'default')) {
      filled[key] = structuredClone(property.default);
    }
  });
  return filled;
};

const unknownKeys = (schema, config, base = '') => {
  if (!isPlainObject(config)) {
    return [];
  }
  const properties = schema.properties || {};
  return Object.entries(config).flatMap(([key, value]) => {
    const pointer = `${base}/${escapeSegment(key)}`;
    const property = properties[key];
    if (!property) {
      return [pointer];
    }
    if (property.properties && !isFreeSubtree(property)) {
      return unknownKeys(property, value, pointer);
    }
    if (isMapSchema(property) && property.additionalProperties.properties) {
      return Object.entries(isPlainObject(value) ? value : {}).flatMap(([entryKey, entry]) =>
        unknownKeys(property.additionalProperties, entry, `${pointer}/${escapeSegment(entryKey)}`)
      );
    }
    return [];
  });
};

const flaggedWithoutReason = (objectSchema, base = '') =>
  Object.entries(objectSchema.properties || {}).flatMap(([key, property]) => {
    const pointer = `${base}/${escapeSegment(key)}`;
    if (property.properties) {
      return flaggedWithoutReason(property, pointer);
    }
    if (isMapSchema(property)) {
      const item = property.additionalProperties;
      if (item.properties) {
        return flaggedWithoutReason(item, `${pointer}/*`);
      }
      if (item.requiresRestart === true && typeof item.restartReason !== 'string') {
        return [`${pointer}/*`];
      }
      return [];
    }
    if (property.requiresRestart === true && typeof property.restartReason !== 'string') {
      return [pointer];
    }
    return [];
  });

const readOnlyPointers = (schema, body, base = '') => {
  if (!isPlainObject(body)) {
    return [];
  }
  const properties = schema.properties || {};
  return Object.entries(body).flatMap(([key, value]) => {
    const property = properties[key];
    const pointer = `${base}/${escapeSegment(key)}`;
    if (!property) {
      return [];
    }
    if (property.readOnly === true) {
      return [pointer];
    }
    if (property.properties) {
      return readOnlyPointers(property, value, pointer);
    }
    if (isMapSchema(property) && isPlainObject(value)) {
      return Object.entries(value).flatMap(([entryKey, entry]) =>
        readOnlyPointers(
          property.additionalProperties,
          entry,
          `${pointer}/${escapeSegment(entryKey)}`
        )
      );
    }
    return [];
  });
};

const mergePatch = (target, patch) => {
  if (!isPlainObject(patch)) {
    return structuredClone(patch);
  }
  const merged = isPlainObject(target) ? { ...target } : {};
  Object.entries(patch).forEach(([key, value]) => {
    if (PROTOTYPE_KEYS.includes(key)) {
      return;
    }
    if (value === null) {
      delete merged[key];
      return;
    }
    merged[key] = isPlainObject(value) ? mergePatch(merged[key], value) : structuredClone(value);
  });
  return merged;
};

const valueAt = (document, pointer) =>
  segmentsOf(pointer).reduce(
    (node, segment) => (node !== null && typeof node === 'object' ? node[segment] : undefined),
    document
  );

const propertyAt = (schema, pointer) =>
  segmentsOf(pointer).reduce((property, segment) => {
    if (!property) {
      return undefined;
    }
    if (property.properties && property.properties[segment]) {
      return property.properties[segment];
    }
    if (isMapSchema(property)) {
      return property.additionalProperties;
    }
    return undefined;
  }, schema);

const leaves = (schema, document, base = '') =>
  Object.entries(schema.properties || {}).flatMap(([key, property]) => {
    const pointer = `${base}/${escapeSegment(key)}`;
    const value = isPlainObject(document) ? document[key] : undefined;
    if (property.properties && !isFreeSubtree(property)) {
      return leaves(property, value, pointer);
    }
    if (isMapSchema(property) && property.additionalProperties.properties) {
      return Object.entries(isPlainObject(value) ? value : {}).flatMap(([entryKey, entry]) =>
        leaves(property.additionalProperties, entry, `${pointer}/${escapeSegment(entryKey)}`)
      );
    }
    if (isFreeSubtree(property)) {
      return [];
    }
    return [{ pointer, property, value }];
  });

const changed = (before, after) => JSON.stringify(before ?? null) !== JSON.stringify(after ?? null);

const restartDiff = (schema, before, after, base = '') =>
  Object.entries(schema.properties || {}).flatMap(([key, property]) => {
    const pointer = `${base}/${escapeSegment(key)}`;
    const previous = isPlainObject(before) ? before[key] : undefined;
    const next = isPlainObject(after) ? after[key] : undefined;
    if (property.properties) {
      return restartDiff(property, previous, next, pointer);
    }
    if (isMapSchema(property)) {
      const item = property.additionalProperties;
      const keys = new Set([
        ...Object.keys(isPlainObject(previous) ? previous : {}),
        ...Object.keys(isPlainObject(next) ? next : {}),
      ]);
      return [...keys].flatMap(entryKey => {
        const entryPointer = `${pointer}/${escapeSegment(entryKey)}`;
        if (item.properties) {
          return restartDiff(item, previous?.[entryKey], next?.[entryKey], entryPointer);
        }
        if (item.requiresRestart === true && changed(previous?.[entryKey], next?.[entryKey])) {
          return [
            { pointer: entryPointer, title: item.title || entryKey, reason: item.restartReason },
          ];
        }
        return [];
      });
    }
    if (property.requiresRestart === true && changed(previous, next)) {
      return [{ pointer, title: property.title || key, reason: property.restartReason }];
    }
    return [];
  });

const hookErrors = async (name, schema, document, { writable, reachable }) => {
  const results = await Promise.all(
    leaves(schema, document).flatMap(({ pointer, value }) => [
      writable ? writable(pointer, value, name, document) : [],
      reachable ? reachable(pointer, value, name, document) : [],
    ])
  );
  return results.flat();
};

const readSchema = name =>
  parseYaml(fs.readFileSync(join(state.schemaDir, `${name}.schema.yaml`), 'utf8'), {
    schema: CORE_SCHEMA,
  });

const readRaw = name => {
  try {
    const parsed = parseYaml(fs.readFileSync(filePath(name), 'utf8'), { schema: CORE_SCHEMA });
    if (parsed !== undefined && parsed !== null && !isPlainObject(parsed)) {
      return { error: { pointer: '', rule: 'type', params: { type: 'object' } } };
    }
    return { value: parsed || {} };
  } catch (error) {
    const { line: row, column } = error.mark || {};
    return {
      error: {
        pointer: '',
        rule: 'yaml',
        params: { line: row === undefined ? undefined : row + 1, column, message: error.message },
      },
    };
  }
};

const fillSetupToken = () => {
  const tokenPath = setupTokenPath();
  if (!fs.existsSync(tokenPath)) {
    return;
  }
  if (fs.readFileSync(tokenPath, 'utf8').trim() !== '') {
    return;
  }
  fs.writeFileSync(tokenPath, randomBytes(32).toString('hex'), { mode: 0o600 });
  process.stdout.write(
    `${JSON.stringify({ level: 'info', category: 'app', message: 'setup token written', path: tokenPath })}\n`
  );
};

const loadOne = async name => {
  const schema = readSchema(name);
  state.schemas.set(name, schema);
  const parsed = readRaw(name);
  if (parsed.error) {
    line('error', name, { message: 'configuration file could not be read', ...parsed.error });
    return false;
  }
  const raw = parsed.value;
  const filled = fillDefaults(schema, raw);
  const errors = [
    ...validateObject(schema, filled, schema),
    ...(await hookErrors(name, schema, filled, { writable: state.hooks.writable })),
    ...flaggedWithoutReason(schema).map(pointer => ({
      pointer,
      rule: 'restartReason',
      params: {},
    })),
  ];
  unknownKeys(schema, raw).forEach(pointer => {
    line('warn', name, { message: 'unknown configuration key', pointer });
  });
  errors.forEach(error => {
    line('error', name, { message: 'configuration value failed its schema', ...error });
  });
  if (errors.length > 0) {
    return false;
  }
  state.raw.set(name, raw);
  state.filled.set(name, filled);
  return true;
};

/**
 * Read every configuration file in list order, fill its defaults in memory,
 * evaluate it against its schema and the backend's writable hook, reachable
 * running at save alone, and stop the process with a non-zero exit when any
 * file fails.
 * @param {string} configDir - The production configuration directory; when it does not exist the development directory beside the module is used with the .dev.config.yaml suffix
 * @param {string[]} names - The code-fixed list of file names
 * @param {string} schemaDir - The directory holding <name>.schema.yaml
 * @param {{writable?: Function, reachable?: Function, onSaved?: Function}} [hooks] - The backend's rules and its after-write hook
 * @returns {Promise<{configDir: string, development: boolean}>} The resolved directory and whether the development layout is in use
 */
const load = async (configDir, names, schemaDir, hooks = {}) => {
  const isDevelopment = !fs.existsSync(configDir);
  Object.assign(state, {
    configDir: isDevelopment ? DEVELOPMENT_DIR : configDir,
    development: isDevelopment,
    names,
    schemaDir,
    hooks,
    schemas: new Map(),
    raw: new Map(),
    filled: new Map(),
  });
  const results = await names.reduce(
    (previous, name) => previous.then(async done => [...done, await loadOne(name)]),
    Promise.resolve([])
  );
  if (results.some(ok => !ok)) {
    process.exit(1);
  }
  fillSetupToken();
  return { configDir: state.configDir, development: state.development };
};

const assertName = name => {
  if (!state.names.includes(name)) {
    throw new Error(`Invalid config name: ${name}`);
  }
};

/**
 * The filled document of one file, or the value at a JSON Pointer of it,
 * copied from the cache.
 * @param {string} name - The file name
 * @param {string} [pointer] - An RFC 6901 pointer into the document
 * @returns {*} A copy of the document or the value
 */
const get = (name, pointer) => {
  assertName(name);
  const document = state.filled.get(name);
  return structuredClone(pointer ? valueAt(document, pointer) : document);
};

/**
 * The parsed schema document of one file.
 * @param {string} name - The file name
 * @returns {Object} The schema
 */
const schemaOf = name => {
  assertName(name);
  return state.schemas.get(name);
};

const prepare = async (name, body) => {
  assertName(name);
  const fileSchema = state.schemas.get(name);
  const merged = mergePatch(state.raw.get(name), body);
  const filled = fillDefaults(fileSchema, merged);
  const errors = [
    ...readOnlyPointers(fileSchema, body).map(pointer => ({
      pointer,
      rule: 'readOnly',
      params: {},
    })),
    ...validateObject(fileSchema, filled, fileSchema),
    ...(await hookErrors(name, fileSchema, filled, state.hooks)),
  ];
  return { name, merged, filled, errors };
};

const writeFile = (name, merged) => {
  const target = filePath(name);
  if (fs.existsSync(target)) {
    fs.copyFileSync(target, `${target}.bak`);
  }
  const temp = `${target}.tmp`;
  fs.writeFileSync(temp, dumpYaml(merged, { noRefs: true, lineWidth: -1 }), { mode: 0o600 });
  fs.renameSync(temp, target);
};

const commit = ({ name, merged, filled }, actor) => {
  const fileSchema = state.schemas.get(name);
  const diff = restartDiff(fileSchema, state.filled.get(name), filled);
  writeFile(name, merged);
  state.raw.set(name, merged);
  state.filled.set(name, filled);
  diff.forEach(entry => state.pending.set(entry.pointer, entry));
  state.lastModifiedBy = actor;
  state.lastModifiedTime = new Date().toISOString();
  if (typeof state.hooks.onSaved === 'function') {
    state.hooks.onSaved(name, actor);
  }
  return diff;
};

class ConfigValidationError extends Error {
  constructor(errors) {
    super('Configuration failed validation');
    this.errors = errors;
  }
}

/**
 * Apply a JSON Merge Patch to one file: validate the filled merge, write it
 * atomically with a .bak beside it, replace the cache, record the restart
 * diff and call the backend's onSaved hook.
 * @param {string} name - The file name
 * @param {Object} body - The merge patch
 * @param {string} actor - Who wrote it
 * @returns {Promise<Array<{pointer: string, title: string, reason: string}>>} The changed flagged leaves
 * @throws {ConfigValidationError} With the failing rules when the merge fails
 */
const save = async (name, body, actor) => {
  const prepared = await prepare(name, body);
  if (prepared.errors.length > 0) {
    throw new ConfigValidationError(prepared.errors);
  }
  return commit(prepared, actor);
};

/**
 * The union of every write's restart list since the last restart.
 * @returns {{restart_required: boolean, requires_restart: Array<Object>, last_modified_by: string|null, last_modified_time: string|null}}
 */
const restartPending = () => ({
  restart_required: state.pending.size > 0,
  requires_restart: [...state.pending.values()],
  last_modified_by: state.lastModifiedBy,
  last_modified_time: state.lastModifiedTime,
});

/**
 * Forget the pending restart list.
 */
const clearRestart = () => {
  state.pending.clear();
};

const notFound = (req, res) => problem(res, req, { status: 404, type: 'not-found' });

const forbidden = (req, res) => problem(res, req, { status: 403, type: 'forbidden' });

const knownName = (req, res, next) => {
  if (!state.names.includes(req.params.name)) {
    return notFound(req, res);
  }
  return next();
};

const setupOpen = (req, res, next) => {
  if (setupComplete()) {
    return notFound(req, res);
  }
  return next();
};

const tokenMatches = token => {
  if (typeof token !== 'string' || setupComplete()) {
    return false;
  }
  const stored = Buffer.from(fs.readFileSync(setupTokenPath(), 'utf8').trim(), 'utf8');
  const sent = Buffer.from(token, 'utf8');
  return stored.length > 0 && stored.length === sent.length && timingSafeEqual(stored, sent);
};

const bearerOf = req => {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
};

const chain = handlers => (Array.isArray(handlers) ? handlers : [handlers]);

const runChain = (handlers, req, res, next) => {
  const step = index => {
    if (index >= handlers.length) {
      return next();
    }
    return handlers[index](req, res, error => (error ? next(error) : step(index + 1)));
  };
  return step(0);
};

const configValidation = (req, res, errors) =>
  refuse(res, req, errors, req.__('problems.configValidation'));

const uploadFor = (lookup, uploadLimit) => {
  const receive = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: uploadLimit },
  }).single('file');
  return (req, res) => {
    receive(req, res, error => {
      if (error) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return problem(res, req, { status: 413, type: 'payload-too-large' });
        }
        return problem(res, req, { status: 400, type: 'bad-request' });
      }
      const { name } = req.params;
      const pointer = req.body?.pointer;
      const property = typeof pointer === 'string' ? propertyAt(lookup(name), pointer) : undefined;
      if (!property || property.action?.kind !== 'upload') {
        return configValidation(req, res, [{ pointer: '/pointer', rule: 'pointer', params: {} }]);
      }
      if (!req.file) {
        return configValidation(req, res, [{ pointer: '/file', rule: 'required', params: {} }]);
      }
      const value = valueAt(state.filled.get(name), pointer);
      const writableFailure = [{ pointer, rule: 'writable', params: { user: state.serviceUser } }];
      if (typeof value !== 'string' || value.trim() === '') {
        return configValidation(req, res, writableFailure);
      }
      const root = fs.realpathSync(state.configDir);
      const target = resolve(root, value);
      if (target !== root && !target.startsWith(root + sep)) {
        return configValidation(req, res, writableFailure);
      }
      try {
        fs.mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
        fs.writeFileSync(target, req.file.buffer, { mode: 0o600 });
        fs.chmodSync(target, 0o600);
      } catch {
        return configValidation(req, res, writableFailure);
      }
      return res.status(200).json({ path: target });
    });
  };
};

/**
 * @swagger
 * /api/config/{name}:
 *   get:
 *     summary: Read one configuration file
 *     description: The raw file parsed to JSON, nothing filled, nothing masked, a YAML null leaf answered as null. Admin only.
 *     tags: [Configuration]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *           enum: [app, auth, db, mail]
 *     responses:
 *       200:
 *         description: The file
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *       403:
 *         description: Not an admin
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: The name is not one status.config lists
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *   put:
 *     summary: Write one configuration file
 *     description: The body is a JSON Merge Patch (RFC 7396) over the raw file, null removing a key, a blank written blank, an array replacing whole. The filled merge is evaluated against the schema and the backend's rules; a 422 carries every failing value with pointers into the body as sent and nothing is written. The 200 lists the changed keys that need a restart. Admin only.
 *     tags: [Configuration]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *           enum: [app, auth, db, mail]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       200:
 *         description: Written
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ConfigSaved'
 *       422:
 *         description: A value breaks a rule, or a readOnly key was sent
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 * /api/config/{name}/schema:
 *   get:
 *     summary: Read the schema of one configuration file
 *     description: The JSON Schema 2020-12 document shipped with the code, verbatim. Admin only.
 *     tags: [Configuration]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *           enum: [app, auth, db, mail]
 *     responses:
 *       200:
 *         description: The schema
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 * /api/config/{name}/upload:
 *   post:
 *     summary: Upload the file a configuration property points at
 *     description: Multipart with the parts file and pointer, the pointer naming a property whose action.kind is upload. The upload is written to the path that property holds, under the configuration directory, mode 0600. Admin session or setup token.
 *     tags: [Configuration]
 *     security:
 *       - JwtAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *           enum: [app, auth, db, mail]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, pointer]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               pointer:
 *                 type: string
 *                 example: /ssl/cert_path
 *     responses:
 *       200:
 *         description: Written
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 path:
 *                   type: string
 *       413:
 *         description: The file is larger than the upload limit
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: The pointer names no upload property, or the path is outside the configuration directory or not writable
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 * /api/config/restart-status:
 *   get:
 *     summary: The pending restart list
 *     description: The union of every write's restart list since the last restart, with the last actor and time. Admin only.
 *     tags: [Configuration]
 *     security:
 *       - JwtAuth: []
 *     responses:
 *       200:
 *         description: The pending list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RestartStatus'
 * /api/config/restart:
 *   post:
 *     summary: Restart the process
 *     description: Clears the pending list, answers 202 and ends the process with a non-zero status after the answer is flushed; the process manager brings it back. Admin only.
 *     tags: [Configuration]
 *     security:
 *       - JwtAuth: []
 *     responses:
 *       202:
 *         description: Restarting
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Restarting.
 * /api/setup/status:
 *   get:
 *     summary: Whether setup is complete
 *     description: setup_complete is true exactly when the setup token file does not exist. No auth.
 *     tags: [Setup]
 *     responses:
 *       200:
 *         description: The gate
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 setup_complete:
 *                   type: boolean
 * /api/setup/verify-token:
 *   post:
 *     summary: Verify the setup token
 *     description: 204 on a constant-time match with the token file, 403 otherwise, 404 once setup is complete. No auth.
 *     tags: [Setup]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SetupTokenRequest'
 *     responses:
 *       204:
 *         description: Matched
 *       403:
 *         description: Mismatched
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: Setup is complete
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 * /api/setup:
 *   get:
 *     summary: Read every configuration file for the setup page
 *     description: The raw files under configs, under the setup token; 403 on a missing or mismatched token, 404 once setup is complete.
 *     tags: [Setup]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The files
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ConfigResponse'
 *   put:
 *     summary: Write every configuration file from the setup page
 *     description: "The body is { configs: { <name>: <merge patch> } }; every file is evaluated before any is written, the 422 carrying pointers as /configs/<name>/...; on success every file is written with the actor setup, the setup token is deleted and { message } is answered."
 *     tags: [Setup]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ConfigUpdateRequest'
 *     responses:
 *       200:
 *         description: Setup complete
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Setup complete.
 *       422:
 *         description: A value of one of the files breaks its schema
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 * /api/setup/schema:
 *   get:
 *     summary: Read the schema of every configuration file for the setup page
 *     description: Every schema under schemas, under the setup token.
 *     tags: [Setup]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The schemas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 schemas:
 *                   type: object
 *                   additionalProperties:
 *                     type: object
 */

/**
 * Mount the configuration and setup routes of the contract under /api.
 * @param {import('express').Express} app - The Express application
 * @param {{admin: Function|Function[], setup: Function|Function[], stepUp?: Function, actor: Function, user?: string}} auth - The backend's guards, its actor resolver answering the acting person's email address, and its service user name
 * @param {Function} exit - The function ending the process with a non-zero status
 * @param {number} uploadLimit - The upload route's limit in bytes
 */
const routes = (app, auth, exit, uploadLimit) => {
  state.serviceUser = auth.user;
  const admin = chain(auth.admin);
  const setup = [setupOpen, ...chain(auth.setup)];
  const restartGuard = auth.stepUp ? [...admin, auth.stepUp] : admin;
  const adminOrSetup = (req, res, next) => {
    if (tokenMatches(bearerOf(req))) {
      return next();
    }
    return runChain(admin, req, res, next);
  };
  const router = Router();

  router.get('/config/restart-status', admin, (req, res) => {
    void req;
    res.json(restartPending());
  });

  router.post('/config/restart', restartGuard, (req, res) => {
    void req;
    clearRestart();
    res.on('finish', () => exit());
    res.status(202).json({ message: 'Restarting.' });
  });

  router.get('/config/:name/schema', knownName, admin, (req, res) =>
    res.json(state.schemas.get(req.params.name))
  );

  router.post('/config/:name/upload', knownName, adminOrSetup, uploadFor(schemaOf, uploadLimit));

  router.get('/config/:name', knownName, admin, (req, res) =>
    res.json(state.raw.get(req.params.name))
  );

  router.put('/config/:name', knownName, admin, async (req, res) => {
    if (!isPlainObject(req.body)) {
      return problem(res, req, { status: 400, type: 'bad-request' });
    }
    const prepared = await prepare(req.params.name, req.body);
    if (prepared.errors.length > 0) {
      return configValidation(req, res, prepared.errors);
    }
    const requires_restart = commit(prepared, await auth.actor(req));
    return res.json({ message: 'Configuration saved.', requires_restart });
  });

  router.get('/setup/status', (req, res) => {
    void req;
    res.json({ setup_complete: setupComplete() });
  });

  router.post('/setup/verify-token', setupOpen, (req, res) => {
    if (!tokenMatches(req.body?.token)) {
      return forbidden(req, res);
    }
    return res.status(204).end();
  });

  router.get('/setup', setup, (req, res) => {
    void req;
    res.json({ configs: Object.fromEntries(state.names.map(name => [name, state.raw.get(name)])) });
  });

  router.get('/setup/schema', setup, (req, res) => {
    void req;
    res.json({
      schemas: Object.fromEntries(state.names.map(name => [name, state.schemas.get(name)])),
    });
  });

  router.put('/setup', setup, async (req, res) => {
    const configs = req.body?.configs;
    if (!isPlainObject(configs)) {
      return problem(res, req, { status: 400, type: 'bad-request' });
    }
    const prepared = await Promise.all(
      state.names
        .filter(name => Object.hasOwn(configs, name))
        .map(name => prepare(name, isPlainObject(configs[name]) ? configs[name] : {}))
    );
    const errors = prepared.flatMap(entry =>
      entry.errors.map(error => ({ ...error, pointer: `/configs/${entry.name}${error.pointer}` }))
    );
    if (errors.length > 0) {
      return configValidation(req, res, errors);
    }
    prepared.forEach(entry => commit(entry, 'setup'));
    if (!setupComplete()) {
      fs.unlinkSync(setupTokenPath());
    }
    return res.json({ message: 'Setup complete.' });
  });

  app.use('/api', router);
};

export { load, get, save, schemaOf as schema, restartPending, clearRestart, routes };
