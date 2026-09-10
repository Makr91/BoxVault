#!/usr/bin/env node
import fs from 'fs';
import { join } from 'path';
import { load, dump, CORE_SCHEMA } from 'js-yaml';
import migrations from '../app/config/migrations.js';
import { CONFIG_NAMES, PRODUCTION_CONFIG_DIR, SCHEMA_DIR } from '../app/config/boxvault.js';

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const isNode = value => isPlainObject(value) && Object.hasOwn(value, 'value');

const flatten = tree =>
  Object.fromEntries(
    Object.entries(tree).map(([key, entry]) => {
      if (isNode(entry)) {
        return [key, entry.value];
      }
      if (isPlainObject(entry)) {
        const { type, description, section, subsection, subsection_key, required, order, ...rest } =
          entry;
        void type;
        void description;
        void section;
        void subsection;
        void subsection_key;
        void required;
        void order;
        return [key, flatten(rest)];
      }
      return [key, entry];
    })
  );

const isNodeTree = tree =>
  Object.values(tree).some(entry => isNode(entry) || (isPlainObject(entry) && isNodeTree(entry)));

const writeFile = (filePath, file) => {
  fs.copyFileSync(filePath, `${filePath}.bak`);
  const temp = `${filePath}.tmp`;
  fs.writeFileSync(temp, dump(file, { noRefs: true, lineWidth: -1 }), { mode: 0o600 });
  fs.renameSync(temp, filePath);
};

const migrate = name => {
  const schema = load(fs.readFileSync(join(SCHEMA_DIR, `${name}.schema.yaml`), 'utf8'), {
    schema: CORE_SCHEMA,
  });
  const filePath = join(PRODUCTION_CONFIG_DIR, `${name}.config.yaml`);
  if (!fs.existsSync(filePath)) {
    process.stdout.write(`${name}: no file at ${filePath}, nothing to migrate\n`);
    return;
  }
  let file = load(fs.readFileSync(filePath, 'utf8'), { schema: CORE_SCHEMA }) || {};
  let changed = false;

  if (isNodeTree(file)) {
    file = flatten(file);
    changed = true;
    process.stdout.write(`${name}: flattened node tree to plain values\n`);
  }

  const fromVersion = Number(file.schemaVersion) || 1;
  migrations
    .filter(entry => entry.version > fromVersion)
    .forEach(entry => {
      file = entry.migrate(name, file);
      changed = true;
      process.stdout.write(`${name}: migrated to schema version ${entry.version}\n`);
    });

  if (file.schemaVersion !== schema.schemaVersion) {
    file = { ...file, schemaVersion: schema.schemaVersion };
    changed = true;
  }

  if (!changed) {
    process.stdout.write(`${name}: already at schema version ${schema.schemaVersion}\n`);
    return;
  }

  writeFile(filePath, file);
  process.stdout.write(`${name}: updated ${filePath}\n`);
};

CONFIG_NAMES.forEach(migrate);
