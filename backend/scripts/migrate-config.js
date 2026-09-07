#!/usr/bin/env node
import fs from 'fs';
import { load, dump } from 'js-yaml';
import migrations from '../app/config/migrations.js';
import {
  CONFIG_NAMES,
  getConfigPath,
  loadSchema,
  fillDefaults,
} from '../app/utils/config-loader.js';
import { atomicWriteFileSync } from '../app/utils/atomic-file-writer.js';

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

const migrate = name => {
  const schema = loadSchema(name);
  const filePath = getConfigPath(name);
  const exists = fs.existsSync(filePath);
  let file = exists ? load(fs.readFileSync(filePath, 'utf8')) || {} : {};

  if (exists && isNodeTree(file)) {
    file = flatten(file);
    process.stdout.write(`${name}: flattened node tree to plain values\n`);
  }

  const fromVersion = Number(file.schemaVersion) || 1;
  migrations
    .filter(entry => entry.version > fromVersion)
    .forEach(entry => {
      file = entry.migrate(name, file);
      process.stdout.write(`${name}: migrated to schema version ${entry.version}\n`);
    });

  const migrated = { ...fillDefaults(schema, file), schemaVersion: schema.schemaVersion };

  if (exists) {
    fs.copyFileSync(filePath, `${filePath}.bak`);
  }
  atomicWriteFileSync(filePath, dump(migrated), 'utf8');
  process.stdout.write(`${name}: ${exists ? 'updated' : 'created'} ${filePath}\n`);
};

CONFIG_NAMES.forEach(migrate);
