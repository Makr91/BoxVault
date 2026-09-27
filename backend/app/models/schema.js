import { copyFileSync, existsSync } from 'fs';
import { log } from '../utils/Logger.js';
import { foldCase, pendingTables } from './fold-case.js';

const RENAMED_COLUMNS = [
  { table: 'users', from: 'preferred_theme', to: 'preferred_mode' },
  { table: 'users', from: 'preferred_pack', to: 'preferred_theme' },
];

const ENUM_VALUE = /'(?<value>(?:[^']|'')*)'/g;

const inOrder = (items, step) =>
  items.reduce((chain, item) => chain.then(() => step(item)), Promise.resolve());

/**
 * Rename the columns a release renamed, in the order the list gives, each
 * only while its table holds the old name and not the new one, so a database
 * already renamed, by an earlier start or by hand, is left alone.
 * @param {Object} sequelize - The open connection
 * @returns {Promise<string[]>} The renames made, as `table.from to table.to`
 */
const renameColumns = async sequelize => {
  const queryInterface = sequelize.getQueryInterface();
  const made = [];
  await inOrder(RENAMED_COLUMNS, async ({ table, from, to }) => {
    if (!(await queryInterface.tableExists(table))) {
      return;
    }
    const columns = await queryInterface.describeTable(table);
    if (!columns[from] || columns[to]) {
      return;
    }
    const quote = name => queryInterface.quoteIdentifier(name);
    await sequelize.query(
      `ALTER TABLE ${quote(table)} RENAME COLUMN ${quote(from)} TO ${quote(to)}`,
      { raw: true }
    );
    made.push(`${table}.${from} to ${table}.${to}`);
  });
  return made;
};

const enumValuesOf = type =>
  [...String(type).matchAll(ENUM_VALUE)].map(match => match.groups.value.replace(/''/g, "'"));

/**
 * Widen every ENUM column of a MariaDB or MySQL database that lacks a value
 * its model names; SQLite stores an ENUM as text and takes any value.
 * @param {Object} sequelize - The open connection
 * @returns {Promise<string[]>} The columns widened, as `table.column`
 */
const growEnums = async sequelize => {
  const queryInterface = sequelize.getQueryInterface();
  const widened = [];
  await inOrder(Object.values(sequelize.models), async model => {
    const table = model.getTableName();
    const enums = Object.values(model.rawAttributes).filter(
      attribute => attribute.type instanceof sequelize.Sequelize.DataTypes.ENUM
    );
    if (enums.length === 0 || !(await queryInterface.tableExists(table))) {
      return;
    }
    const columns = await queryInterface.describeTable(table);
    await inOrder(enums, async attribute => {
      const column = columns[attribute.field];
      if (!column) {
        return;
      }
      const stored = enumValuesOf(column.type);
      if (attribute.type.values.every(value => stored.includes(value))) {
        return;
      }
      await queryInterface.changeColumn(table, attribute.field, attribute);
      widened.push(`${table}.${attribute.field}`);
    });
  });
  return widened;
};

const executorOf = sequelize => ({
  all: sql => sequelize.query(sql, { type: sequelize.Sequelize.QueryTypes.SELECT, raw: true }),
  run: sql => sequelize.query(sql, { raw: true }),
});

/**
 * Make a SQLite database compare text without regard to letter case, keeping
 * a copy of the database file beside it as `.bak` before the first table is
 * rebuilt; a rebuild that fails leaves the database as it was and is logged.
 * @param {Object} sequelize - The open SQLite connection
 * @returns {Promise<string[]>} The tables rebuilt
 */
const foldSqliteCase = async sequelize => {
  const executor = executorOf(sequelize);
  if ((await pendingTables(executor)).length === 0) {
    return [];
  }
  const { storage } = sequelize.options;
  if (storage && storage !== ':memory:' && existsSync(storage)) {
    copyFileSync(storage, `${storage}.bak`);
  }
  const { rebuilt, error } = await foldCase(executor);
  if (error) {
    log.database.error(
      'Text columns could not be made case-insensitive; the database is unchanged',
      {
        error: error.message,
      }
    );
  }
  return rebuilt;
};

/**
 * Make the two backends behave alike once the tables exist: SQLite's text
 * columns compare without regard to letter case, the way MariaDB's collation
 * does, and MariaDB's ENUM columns hold every value the models name, the way
 * SQLite's text columns do.
 * @param {Object} sequelize - The open connection
 * @returns {Promise<{folded: string[], widened: string[]}>} What changed
 */
const alignBackend = async sequelize => {
  const sqlite = sequelize.getDialect() === 'sqlite';
  return {
    folded: sqlite ? await foldSqliteCase(sequelize) : [],
    widened: sqlite ? [] : await growEnums(sequelize),
  };
};

/**
 * Bring the database to the shape the models name, the same way on SQLite
 * and on MariaDB or MySQL: the renamed columns first, so their values move
 * with them, then every missing table, column and index, never a removal or
 * a change of an existing column, then the alignment of the two backends.
 * @param {Object} sequelize - The open connection
 * @returns {Promise<{renamed: string[], folded: string[], widened: string[]}>} What changed
 */
const upgradeSchema = async sequelize => {
  const renamed = await renameColumns(sequelize);
  await sequelize.sync({ alter: { drop: false } });
  return { renamed, ...(await alignBackend(sequelize)) };
};

export { upgradeSchema, alignBackend, renameColumns };
