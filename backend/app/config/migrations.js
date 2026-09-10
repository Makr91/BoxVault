/**
 * The ordered configuration migrations, one entry per schema version above 1:
 * `{ version, migrate(name, file) }`, where `migrate` receives the file name
 * (`app`, `auth`, `db`, `mail`) and the plain file object and returns the
 * migrated object with only the keys it changes touched. `postinst` on
 * Debian and `startup.sh` on OmniOS run every entry whose version is above
 * the file's `schemaVersion`, in order, and stamp the schema's version.
 */
const renameKey = (tree, from, to) => {
  if (tree && Object.hasOwn(tree, from)) {
    tree[to] = tree[from];
    delete tree[from];
  }
};

const migrations = [
  {
    version: 2,
    migrate: (name, file) => {
      if (name === 'mail') {
        const migrated = structuredClone(file);
        renameKey(migrated.smtp_connect, 'rejectUnauthorized', 'reject_unauthorized');
        renameKey(migrated.smtp_settings, 'replyTo', 'reply_to');
        renameKey(migrated.smtp_settings, 'rateLimit', 'rate_limit');
        return migrated;
      }
      if (name === 'db') {
        const migrated = structuredClone(file);
        if (migrated.sql && Object.hasOwn(migrated.sql, 'dialect')) {
          delete migrated.sql.dialect;
        }
        return migrated;
      }
      return file;
    },
  },
];

export default migrations;
