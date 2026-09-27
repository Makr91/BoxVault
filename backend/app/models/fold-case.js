const TEXT_COLUMN = /\b(?<type>VARCHAR\(\d+\)|TEXT)(?!\s+COLLATE)/g;
const TABLE_NAME = /^CREATE TABLE (?:IF NOT EXISTS )?(?<quote>["`]?)(?<name>[^"`\s(]+)\k<quote>/;
const SUFFIX = '__fold';

const folded = sql => sql.replace(TEXT_COLUMN, '$<type> COLLATE NOCASE');

const quoted = name => `\`${name.replace(/`/g, '``')}\``;

/**
 * The tables of a SQLite database whose text columns still compare letter
 * case exactly, each with its create statement rewritten so they fold it.
 * @param {{all: Function}} executor - `all(sql)` answering the rows of a read
 * @returns {Promise<Array<{name: string, create: string}>>} The tables to rebuild
 */
const pendingTables = async executor => {
  const tables = await executor.all(
    "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
  );
  return tables
    .filter(table => typeof table.sql === 'string' && folded(table.sql) !== table.sql)
    .map(table => ({ name: table.name, create: folded(table.sql) }));
};

const rebuild = async (executor, table) => {
  const temporary = `${table.name}${SUFFIX}`;
  const indexes = await executor.all(
    `SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = '${table.name.replace(/'/g, "''")}' AND sql IS NOT NULL`
  );
  await executor.run(table.create.replace(TABLE_NAME, `CREATE TABLE ${quoted(temporary)}`));
  await executor.run(`INSERT INTO ${quoted(temporary)} SELECT * FROM ${quoted(table.name)}`);
  await executor.run(`DROP TABLE ${quoted(table.name)}`);
  await executor.run(`ALTER TABLE ${quoted(temporary)} RENAME TO ${quoted(table.name)}`);
  await indexes.reduce(
    (chain, index) => chain.then(() => executor.run(index.sql)),
    Promise.resolve()
  );
};

/**
 * Make every text column of a SQLite database compare without regard to
 * letter case, the way MariaDB's collation does, by rebuilding each table
 * that does not yet: foreign keys are switched off for the rebuild so no
 * child row is cascaded away, every table is rebuilt inside one transaction,
 * the foreign keys are checked before it commits, and any failure, two rows
 * that differ only by case under a unique column included, rolls the whole
 * rebuild back and leaves the database as it was.
 * @param {{all: Function, run: Function}} executor - `all(sql)` for reads, `run(sql)` for writes, both on one connection
 * @returns {Promise<{rebuilt: string[], error: Error|null}>} The tables rebuilt, or the failure that rolled them back
 */
const foldCase = async executor => {
  const tables = await pendingTables(executor);
  if (tables.length === 0) {
    return { rebuilt: [], error: null };
  }
  await executor.run('PRAGMA foreign_keys = OFF');
  try {
    await executor.run('BEGIN');
    await tables.reduce(
      (chain, table) => chain.then(() => rebuild(executor, table)),
      Promise.resolve()
    );
    const violations = await executor.all('PRAGMA foreign_key_check');
    if (violations.length > 0) {
      throw new Error(`foreign key check failed on ${violations.length} rows`);
    }
    await executor.run('COMMIT');
    return { rebuilt: tables.map(table => table.name), error: null };
  } catch (error) {
    await executor.run('ROLLBACK').catch(() => null);
    return { rebuilt: [], error };
  } finally {
    await executor.run('PRAGMA foreign_keys = ON');
  }
};

export { foldCase, pendingTables };
