/**
 * The ordered configuration migrations, one entry per schema version above 1:
 * `{ version, migrate(name, file) }`, where `migrate` receives the file name
 * (`app`, `auth`, `db`, `mail`) and the plain file object and returns the
 * migrated object. `postinst` runs every entry whose version is above the
 * file's `schemaVersion`, in order, and writes the last version.
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
      if (name !== 'mail') {
        return file;
      }
      const migrated = structuredClone(file);
      renameKey(migrated.smtp_connect, 'rejectUnauthorized', 'reject_unauthorized');
      renameKey(migrated.smtp_settings, 'replyTo', 'reply_to');
      renameKey(migrated.smtp_settings, 'rateLimit', 'rate_limit');
      return migrated;
    },
  },
];

export default migrations;
