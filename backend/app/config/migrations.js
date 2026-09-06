/**
 * The ordered configuration migrations, one entry per schema version above 1:
 * `{ version, migrate(name, file) }`, where `migrate` receives the file name
 * (`app`, `auth`, `db`, `mail`) and the plain file object and returns the
 * migrated object. `postinst` runs every entry whose version is above the
 * file's `schemaVersion`, in order, and writes the last version.
 */
const migrations = [];

export default migrations;
