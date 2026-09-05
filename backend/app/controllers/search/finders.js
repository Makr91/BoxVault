import db from '../../models/index.js';
import {
  MIN_CHECKSUM_LENGTH,
  likeClauses,
  metadataLike,
  matchedField,
  matchedMetadataKey,
  checksumMatches,
} from './scope.js';

const {
  organization: Organization,
  user: User,
  UserOrg,
  box: Box,
  versions: Version,
  providers: Provider,
  architectures: Architecture,
  files: File,
  iso: Iso,
  isoVersions: IsoVersion,
  isoFiles: IsoFile,
  Sequelize,
} = db;
const { Op } = Sequelize;

const ORGANIZATION_FIELDS = ['name', 'display_name', 'description'];
const BOX_FIELDS = ['name', 'description', 'shortDescription', 'readme', 'githubRepo'];
const ISO_FIELDS = ['name', 'description'];
const VERSION_FIELDS = ['versionNumber', 'description', 'releaseNotes', 'deprecationReason'];
const PROVIDER_FIELDS = ['name', 'description'];
const ARCHITECTURE_FIELDS = ['name'];
const FILE_FIELDS = ['fileName'];

/**
 * One result row; the subtitle is the plain-text chain above the hit.
 * @param {Object} fields - kind, collection, org, name, version, provider, architecture, title, matched
 * @param {string[]} chain - The context parts, joined with a middle dot
 * @returns {Object} The row
 */
const row = (fields, chain) => {
  const { collection = null, version = '', provider = '', architecture = '' } = fields;
  return {
    kind: fields.kind,
    collection,
    org: fields.org,
    name: fields.name,
    version,
    provider,
    architecture,
    title: fields.title,
    subtitle: chain.filter(Boolean).join(' · '),
    matched: fields.matched,
  };
};

const organizationInclude = () => ({
  model: Organization,
  as: 'organization',
  attributes: ['name'],
});

const boxInclude = boxWhere => ({
  model: Box,
  as: 'box',
  where: boxWhere,
  required: true,
  attributes: ['name'],
  include: [organizationInclude()],
});

const versionInclude = boxWhere => ({
  model: Version,
  as: 'version',
  required: true,
  attributes: ['versionNumber'],
  include: [boxInclude(boxWhere)],
});

const providerInclude = boxWhere => ({
  model: Provider,
  as: 'provider',
  required: true,
  attributes: ['name'],
  include: [versionInclude(boxWhere)],
});

const architectureInclude = boxWhere => ({
  model: Architecture,
  as: 'architecture',
  required: true,
  attributes: ['name'],
  include: [providerInclude(boxWhere)],
});

const isoInclude = isoWhere => ({
  model: Iso,
  as: 'iso',
  where: isoWhere,
  required: true,
  attributes: ['name'],
  include: [organizationInclude()],
});

const isoVersionInclude = isoWhere => ({
  model: IsoVersion,
  as: 'version',
  required: true,
  attributes: ['versionNumber'],
  include: [isoInclude(isoWhere)],
});

const fileClauses = ({ contains, prefix, term }) => {
  const clauses = likeClauses(FILE_FIELDS, contains);
  if (term.length >= MIN_CHECKSUM_LENGTH) {
    clauses.push({ checksum: { [Op.like]: prefix } });
  }
  return clauses;
};

const matchedFileField = (file, term) => {
  if (checksumMatches(file.checksum, term)) {
    return 'checksum';
  }
  return matchedField(file, FILE_FIELDS, term);
};

const findOrganizations = async ({ term, contains, organizationWhere }) => {
  const organizations = await Organization.findAll({
    where: {
      [Op.and]: [organizationWhere, { [Op.or]: likeClauses(ORGANIZATION_FIELDS, contains) }],
    },
    attributes: ['id', ...ORGANIZATION_FIELDS],
  });
  return organizations
    .map(organization => {
      const matched = matchedField(organization, ORGANIZATION_FIELDS, term);
      if (!matched) {
        return null;
      }
      return row(
        {
          kind: 'organization',
          org: organization.name,
          name: organization.name,
          title: organization.display_name || organization.name,
          matched,
        },
        []
      );
    })
    .filter(Boolean);
};

const findBoxes = async ({ term, contains, boxWhere }) => {
  const boxes = await Box.findAll({
    where: {
      [Op.and]: [
        boxWhere,
        { [Op.or]: [...likeClauses(BOX_FIELDS, contains), metadataLike('box', contains)] },
      ],
    },
    attributes: ['id', ...BOX_FIELDS, 'metadata'],
    include: [organizationInclude()],
  });
  return boxes
    .map(box => {
      const matched = matchedField(box, BOX_FIELDS, term) || matchedMetadataKey(box.metadata, term);
      if (!matched) {
        return null;
      }
      const org = box.organization.name;
      return row(
        { kind: 'item', collection: 'boxes', org, name: box.name, title: box.name, matched },
        [org, 'boxes']
      );
    })
    .filter(Boolean);
};

const findIsos = async ({ term, contains, isoWhere }) => {
  const isos = await Iso.findAll({
    where: {
      [Op.and]: [
        isoWhere,
        { [Op.or]: [...likeClauses(ISO_FIELDS, contains), metadataLike('iso', contains)] },
      ],
    },
    attributes: ['id', ...ISO_FIELDS, 'metadata'],
    include: [organizationInclude()],
  });
  return isos
    .map(iso => {
      const matched = matchedField(iso, ISO_FIELDS, term) || matchedMetadataKey(iso.metadata, term);
      if (!matched) {
        return null;
      }
      const org = iso.organization.name;
      return row(
        { kind: 'item', collection: 'isos', org, name: iso.name, title: iso.name, matched },
        [org, 'isos']
      );
    })
    .filter(Boolean);
};

const findBoxVersions = async ({ term, contains, boxWhere }) => {
  const versions = await Version.findAll({
    where: { [Op.or]: likeClauses(VERSION_FIELDS, contains) },
    attributes: ['id', ...VERSION_FIELDS],
    include: [boxInclude(boxWhere)],
  });
  return versions
    .map(version => {
      const matched = matchedField(version, VERSION_FIELDS, term);
      if (!matched) {
        return null;
      }
      const org = version.box.organization.name;
      const { name } = version.box;
      return row(
        {
          kind: 'version',
          collection: 'boxes',
          org,
          name,
          version: version.versionNumber,
          title: version.versionNumber,
          matched,
        },
        [org, 'boxes', name]
      );
    })
    .filter(Boolean);
};

const findIsoVersions = async ({ term, contains, isoWhere }) => {
  const versions = await IsoVersion.findAll({
    where: { [Op.or]: likeClauses(VERSION_FIELDS, contains) },
    attributes: ['id', ...VERSION_FIELDS],
    include: [isoInclude(isoWhere)],
  });
  return versions
    .map(version => {
      const matched = matchedField(version, VERSION_FIELDS, term);
      if (!matched) {
        return null;
      }
      const org = version.iso.organization.name;
      const { name } = version.iso;
      return row(
        {
          kind: 'version',
          collection: 'isos',
          org,
          name,
          version: version.versionNumber,
          title: version.versionNumber,
          matched,
        },
        [org, 'isos', name]
      );
    })
    .filter(Boolean);
};

const findProviders = async ({ term, contains, boxWhere }) => {
  const providers = await Provider.findAll({
    where: { [Op.or]: likeClauses(PROVIDER_FIELDS, contains) },
    attributes: ['id', ...PROVIDER_FIELDS],
    include: [versionInclude(boxWhere)],
  });
  return providers
    .map(provider => {
      const matched = matchedField(provider, PROVIDER_FIELDS, term);
      if (!matched) {
        return null;
      }
      const { version } = provider;
      const org = version.box.organization.name;
      const { name } = version.box;
      return row(
        {
          kind: 'provider',
          collection: 'boxes',
          org,
          name,
          version: version.versionNumber,
          provider: provider.name,
          title: provider.name,
          matched,
        },
        [org, 'boxes', name, version.versionNumber]
      );
    })
    .filter(Boolean);
};

const findArchitectures = async ({ term, contains, boxWhere }) => {
  const architectures = await Architecture.findAll({
    where: { [Op.or]: likeClauses(ARCHITECTURE_FIELDS, contains) },
    attributes: ['id', ...ARCHITECTURE_FIELDS],
    include: [providerInclude(boxWhere)],
  });
  return architectures
    .map(architecture => {
      const matched = matchedField(architecture, ARCHITECTURE_FIELDS, term);
      if (!matched) {
        return null;
      }
      const { provider } = architecture;
      const { version } = provider;
      const org = version.box.organization.name;
      const { name } = version.box;
      return row(
        {
          kind: 'architecture',
          collection: 'boxes',
          org,
          name,
          version: version.versionNumber,
          provider: provider.name,
          architecture: architecture.name,
          title: architecture.name,
          matched,
        },
        [org, 'boxes', name, version.versionNumber, provider.name]
      );
    })
    .filter(Boolean);
};

const findBoxFiles = async context => {
  const { term, boxWhere } = context;
  const files = await File.findAll({
    where: { [Op.or]: fileClauses(context) },
    attributes: ['id', 'fileName', 'checksum'],
    include: [architectureInclude(boxWhere)],
  });
  return files
    .map(file => {
      const matched = matchedFileField(file, term);
      if (!matched) {
        return null;
      }
      const { architecture } = file;
      const { provider } = architecture;
      const { version } = provider;
      const org = version.box.organization.name;
      const { name } = version.box;
      return row(
        {
          kind: 'artifact',
          collection: 'boxes',
          org,
          name,
          version: version.versionNumber,
          provider: provider.name,
          architecture: architecture.name,
          title: file.fileName,
          matched,
        },
        [org, 'boxes', name, version.versionNumber, provider.name, architecture.name]
      );
    })
    .filter(Boolean);
};

const findIsoFiles = async context => {
  const { term, isoWhere } = context;
  const files = await IsoFile.findAll({
    where: { [Op.or]: fileClauses(context) },
    attributes: ['id', 'fileName', 'checksum', 'architecture'],
    include: [isoVersionInclude(isoWhere)],
  });
  return files
    .map(file => {
      const matched = matchedFileField(file, term);
      if (!matched) {
        return null;
      }
      const { version } = file;
      const org = version.iso.organization.name;
      const { name } = version.iso;
      return row(
        {
          kind: 'artifact',
          collection: 'isos',
          org,
          name,
          version: version.versionNumber,
          architecture: file.architecture,
          title: file.fileName,
          matched,
        },
        [org, 'isos', name, version.versionNumber, file.architecture]
      );
    })
    .filter(Boolean);
};

const USER_FIELDS = ['username', 'email'];

const userRow = (user, org, term) => {
  const matched = matchedField(user, USER_FIELDS, term);
  if (!matched) {
    return null;
  }
  return row({ kind: 'user', org, name: user.username, title: user.username, matched }, [org]);
};

const findUsers = async ({ term, contains, viewer, isAdmin, managedOrgIds }) => {
  if (!viewer) {
    return [];
  }
  const where = { [Op.or]: likeClauses(USER_FIELDS, contains) };
  if (isAdmin) {
    const users = await User.findAll({
      where,
      attributes: ['id', ...USER_FIELDS],
      include: [{ model: Organization, as: 'primaryOrganization', attributes: ['name'] }],
    });
    return users
      .map(user => userRow(user, user.primaryOrganization?.name || '', term))
      .filter(Boolean);
  }
  if (managedOrgIds.length === 0) {
    return [];
  }
  const memberships = await UserOrg.findAll({
    where: { organization_id: { [Op.in]: managedOrgIds } },
    attributes: ['id', 'organization_id'],
    include: [
      { model: User, as: 'user', where, required: true, attributes: ['id', ...USER_FIELDS] },
      organizationInclude(),
    ],
  });
  return memberships
    .map(membership => userRow(membership.user, membership.organization.name, term))
    .filter(Boolean);
};

const FINDERS = {
  organization: findOrganizations,
  item: async context => [...(await findBoxes(context)), ...(await findIsos(context))],
  version: async context => [
    ...(await findBoxVersions(context)),
    ...(await findIsoVersions(context)),
  ],
  provider: findProviders,
  architecture: findArchitectures,
  artifact: async context => [...(await findBoxFiles(context)), ...(await findIsoFiles(context))],
  user: findUsers,
};

export { FINDERS };
