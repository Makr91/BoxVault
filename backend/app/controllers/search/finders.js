import db from '../../models/index.js';
import { reachOf, withinReach } from '../../utils/orgMembership.js';
import {
  tokenClauses,
  matchedChain,
  metadataLike,
  metadataEntries,
  isChecksumTerm,
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
  download: Download,
  downloadReleases: DownloadRelease,
  downloadPatches: DownloadPatch,
  downloadFiles: DownloadFile,
  Sequelize,
} = db;
const { Op } = Sequelize;

const ORGANIZATION_FIELDS = ['name', 'display_name', 'description'];
const BOX_FIELDS = ['name', 'description', 'shortDescription', 'readme', 'githubRepo'];
const ISO_FIELDS = ['name', 'description'];
const DOWNLOAD_FIELDS = ['name', 'description', 'family', 'vendor'];
const VERSION_FIELDS = ['versionNumber', 'description', 'releaseNotes', 'deprecationReason'];
const PROVIDER_FIELDS = ['name', 'description'];
const PATCH_FIELDS = ['name', 'description'];
const ARCHITECTURE_FIELDS = ['name'];
const FILE_FIELDS = ['fileName'];
const USER_FIELDS = ['username', 'email'];
const ITEM_REACH_FIELDS = ['organizationId', 'userId', 'isPublic', 'guestAccess', 'published'];
const ROW_REACH_FIELDS = ['isPublic', 'guestAccess', 'published'];

/**
 * Whether the rows beneath an item are within the viewer's reach on that
 * item; the item itself is judged by the finder's where clause.
 * @param {Object|null} viewer - From resolveIsoViewer
 * @param {Object} item - The box, ISO or download row
 * @param {...Object} rows - The rows beneath it, parent first
 * @returns {boolean}
 */
const reaches = (viewer, item, ...rows) => withinReach(reachOf(viewer, item), ...rows);

/**
 * The chain entries of a row's own fields, in match priority order.
 * @param {Object} record - The row
 * @param {string[]} fields - Field names
 * @returns {Array<[string, *]>} The entries
 */
const own = (record, fields) => fields.map(field => [field, record[field]]);

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
  attributes: ['name', ...ITEM_REACH_FIELDS],
  include: [organizationInclude()],
});

const versionInclude = boxWhere => ({
  model: Version,
  as: 'version',
  required: true,
  attributes: ['versionNumber', ...ROW_REACH_FIELDS],
  include: [boxInclude(boxWhere)],
});

const providerInclude = boxWhere => ({
  model: Provider,
  as: 'provider',
  required: true,
  attributes: ['name', ...ROW_REACH_FIELDS],
  include: [versionInclude(boxWhere)],
});

const architectureInclude = boxWhere => ({
  model: Architecture,
  as: 'architecture',
  required: true,
  attributes: ['name', ...ROW_REACH_FIELDS],
  include: [providerInclude(boxWhere)],
});

const isoInclude = isoWhere => ({
  model: Iso,
  as: 'iso',
  where: isoWhere,
  required: true,
  attributes: ['name', ...ITEM_REACH_FIELDS],
  include: [organizationInclude()],
});

const isoVersionInclude = isoWhere => ({
  model: IsoVersion,
  as: 'version',
  required: true,
  attributes: ['versionNumber', ...ROW_REACH_FIELDS],
  include: [isoInclude(isoWhere)],
});

const downloadInclude = downloadWhere => ({
  model: Download,
  as: 'download',
  where: downloadWhere,
  required: true,
  attributes: ['name', ...ITEM_REACH_FIELDS],
  include: [organizationInclude()],
});

const releaseInclude = downloadWhere => ({
  model: DownloadRelease,
  as: 'release',
  required: true,
  attributes: ['versionNumber', ...ROW_REACH_FIELDS],
  include: [downloadInclude(downloadWhere)],
});

const patchInclude = downloadWhere => ({
  model: DownloadPatch,
  as: 'patch',
  required: true,
  attributes: ['name', ...ROW_REACH_FIELDS],
  include: [releaseInclude(downloadWhere)],
});

/**
 * The where clause of a file finder: the token search over the chain, or a
 * checksum prefix when the term is one word long enough to be one.
 * @param {string[]} columns - The chain columns
 * @param {{tokens: Object[], term: string, prefix: string}} context - The search context
 * @returns {Object} The where clause
 */
const fileWhere = (columns, { tokens, term, prefix }) => {
  const clauses = tokenClauses(columns, tokens);
  return isChecksumTerm(term)
    ? { [Op.or]: [clauses, { checksum: { [Op.like]: prefix } }] }
    : clauses;
};

/**
 * The field a file hit matched on: the checksum when the term is its prefix,
 * else the first of the chain entries.
 * @param {Object} file - The file row
 * @param {Array<[string, *]>} entries - The chain entries after the file name
 * @param {{tokens: Object[], term: string}} context - The search context
 * @returns {string|null} The matched field name
 */
const matchedFile = (file, entries, { tokens, term }) => {
  if (checksumMatches(file.checksum, term)) {
    return 'checksum';
  }
  return matchedChain([['fileName', file.fileName], ...entries], tokens);
};

const findOrganizations = async ({ tokens, organizationWhere }) => {
  const organizations = await Organization.findAll({
    where: { [Op.and]: [organizationWhere, tokenClauses(ORGANIZATION_FIELDS, tokens)] },
    attributes: ['id', ...ORGANIZATION_FIELDS],
  });
  return organizations
    .map(organization => {
      const matched = matchedChain(own(organization, ORGANIZATION_FIELDS), tokens);
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

const findBoxes = async ({ tokens, boxWhere }) => {
  const boxes = await Box.findAll({
    where: {
      [Op.and]: [
        boxWhere,
        tokenClauses(BOX_FIELDS, tokens, pattern => [metadataLike('box', pattern)]),
      ],
    },
    attributes: ['id', ...BOX_FIELDS, 'metadata'],
    include: [organizationInclude()],
  });
  return boxes
    .map(box => {
      const matched = matchedChain(
        [...own(box, BOX_FIELDS), ...metadataEntries(box.metadata)],
        tokens
      );
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

const findIsos = async ({ tokens, isoWhere }) => {
  const isos = await Iso.findAll({
    where: {
      [Op.and]: [
        isoWhere,
        tokenClauses(ISO_FIELDS, tokens, pattern => [metadataLike('iso', pattern)]),
      ],
    },
    attributes: ['id', ...ISO_FIELDS, 'metadata'],
    include: [organizationInclude()],
  });
  return isos
    .map(iso => {
      const matched = matchedChain(
        [...own(iso, ISO_FIELDS), ...metadataEntries(iso.metadata)],
        tokens
      );
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

const findDownloads = async ({ tokens, downloadWhere }) => {
  const downloads = await Download.findAll({
    where: { [Op.and]: [downloadWhere, tokenClauses(DOWNLOAD_FIELDS, tokens)] },
    attributes: ['id', ...DOWNLOAD_FIELDS],
    include: [organizationInclude()],
  });
  return downloads
    .map(download => {
      const matched = matchedChain(own(download, DOWNLOAD_FIELDS), tokens);
      if (!matched) {
        return null;
      }
      const org = download.organization.name;
      return row(
        {
          kind: 'item',
          collection: 'downloads',
          org,
          name: download.name,
          title: download.name,
          matched,
        },
        [org, 'downloads']
      );
    })
    .filter(Boolean);
};

const findBoxVersions = async ({ tokens, boxWhere, viewer }) => {
  const versions = await Version.findAll({
    where: tokenClauses([...VERSION_FIELDS, '$box.name$'], tokens),
    attributes: ['id', ...VERSION_FIELDS, ...ROW_REACH_FIELDS],
    include: [boxInclude(boxWhere)],
  });
  return versions
    .map(version => {
      const matched = matchedChain(
        [...own(version, VERSION_FIELDS), ['box', version.box.name]],
        tokens
      );
      if (!matched || !reaches(viewer, version.box, version)) {
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

const findIsoVersions = async ({ tokens, isoWhere, viewer }) => {
  const versions = await IsoVersion.findAll({
    where: tokenClauses([...VERSION_FIELDS, '$iso.name$'], tokens),
    attributes: ['id', ...VERSION_FIELDS, ...ROW_REACH_FIELDS],
    include: [isoInclude(isoWhere)],
  });
  return versions
    .map(version => {
      const matched = matchedChain(
        [...own(version, VERSION_FIELDS), ['iso', version.iso.name]],
        tokens
      );
      if (!matched || !reaches(viewer, version.iso, version)) {
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

const findReleases = async ({ tokens, downloadWhere, viewer }) => {
  const releases = await DownloadRelease.findAll({
    where: tokenClauses([...VERSION_FIELDS, '$download.name$'], tokens),
    attributes: ['id', ...VERSION_FIELDS, ...ROW_REACH_FIELDS],
    include: [downloadInclude(downloadWhere)],
  });
  return releases
    .map(release => {
      const matched = matchedChain(
        [...own(release, VERSION_FIELDS), ['download', release.download.name]],
        tokens
      );
      if (!matched || !reaches(viewer, release.download, release)) {
        return null;
      }
      const org = release.download.organization.name;
      const { name } = release.download;
      return row(
        {
          kind: 'version',
          collection: 'downloads',
          org,
          name,
          version: release.versionNumber,
          title: release.versionNumber,
          matched,
        },
        [org, 'downloads', name]
      );
    })
    .filter(Boolean);
};

const findProviders = async ({ tokens, boxWhere, viewer }) => {
  const providers = await Provider.findAll({
    where: tokenClauses(
      [...PROVIDER_FIELDS, '$version.versionNumber$', '$version.box.name$'],
      tokens
    ),
    attributes: ['id', ...PROVIDER_FIELDS, ...ROW_REACH_FIELDS],
    include: [versionInclude(boxWhere)],
  });
  return providers
    .map(provider => {
      const { version } = provider;
      const matched = matchedChain(
        [
          ...own(provider, PROVIDER_FIELDS),
          ['version', version.versionNumber],
          ['box', version.box.name],
        ],
        tokens
      );
      if (!matched || !reaches(viewer, version.box, version, provider)) {
        return null;
      }
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

const findPatches = async ({ tokens, downloadWhere, viewer }) => {
  const patches = await DownloadPatch.findAll({
    where: tokenClauses(
      [...PATCH_FIELDS, '$release.versionNumber$', '$release.download.name$'],
      tokens
    ),
    attributes: ['id', ...PATCH_FIELDS, ...ROW_REACH_FIELDS],
    include: [releaseInclude(downloadWhere)],
  });
  return patches
    .map(patch => {
      const { release } = patch;
      const matched = matchedChain(
        [
          ...own(patch, PATCH_FIELDS),
          ['release', release.versionNumber],
          ['download', release.download.name],
        ],
        tokens
      );
      if (!matched || !reaches(viewer, release.download, release, patch)) {
        return null;
      }
      const org = release.download.organization.name;
      const { name } = release.download;
      return row(
        {
          kind: 'provider',
          collection: 'downloads',
          org,
          name,
          version: release.versionNumber,
          provider: patch.name,
          title: patch.name,
          matched,
        },
        [org, 'downloads', name, release.versionNumber]
      );
    })
    .filter(Boolean);
};

const findArchitectures = async ({ tokens, boxWhere, viewer }) => {
  const architectures = await Architecture.findAll({
    where: tokenClauses(
      [
        ...ARCHITECTURE_FIELDS,
        '$provider.name$',
        '$provider.version.versionNumber$',
        '$provider.version.box.name$',
      ],
      tokens
    ),
    attributes: ['id', ...ARCHITECTURE_FIELDS, ...ROW_REACH_FIELDS],
    include: [providerInclude(boxWhere)],
  });
  return architectures
    .map(architecture => {
      const { provider } = architecture;
      const { version } = provider;
      const matched = matchedChain(
        [
          ...own(architecture, ARCHITECTURE_FIELDS),
          ['provider', provider.name],
          ['version', version.versionNumber],
          ['box', version.box.name],
        ],
        tokens
      );
      if (!matched || !reaches(viewer, version.box, version, provider, architecture)) {
        return null;
      }
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

const findDownloadFiles = async context => {
  const { downloadWhere, viewer } = context;
  const files = await DownloadFile.findAll({
    where: fileWhere(
      [
        ...FILE_FIELDS,
        'key',
        '$patch.name$',
        '$patch.release.versionNumber$',
        '$patch.release.download.name$',
      ],
      context
    ),
    attributes: ['id', 'key', 'fileName', 'checksum', ...ROW_REACH_FIELDS],
    include: [patchInclude(downloadWhere)],
  });
  return files
    .map(file => {
      const { patch } = file;
      const { release } = patch;
      const matched = matchedFile(
        file,
        [
          ['key', file.key],
          ['patch', patch.name],
          ['release', release.versionNumber],
          ['download', release.download.name],
        ],
        context
      );
      if (!matched || !reaches(viewer, release.download, release, patch, file)) {
        return null;
      }
      const org = release.download.organization.name;
      const { name } = release.download;
      return row(
        {
          kind: 'architecture',
          collection: 'downloads',
          org,
          name,
          version: release.versionNumber,
          provider: patch.name,
          architecture: file.key,
          title: file.fileName,
          matched,
        },
        [org, 'downloads', name, release.versionNumber, patch.name]
      );
    })
    .filter(Boolean);
};

const findBoxFiles = async context => {
  const { boxWhere, viewer } = context;
  const files = await File.findAll({
    where: fileWhere(
      [
        ...FILE_FIELDS,
        '$architecture.name$',
        '$architecture.provider.name$',
        '$architecture.provider.version.versionNumber$',
        '$architecture.provider.version.box.name$',
      ],
      context
    ),
    attributes: ['id', 'fileName', 'checksum', ...ROW_REACH_FIELDS],
    include: [architectureInclude(boxWhere)],
  });
  return files
    .map(file => {
      const { architecture } = file;
      const { provider } = architecture;
      const { version } = provider;
      const matched = matchedFile(
        file,
        [
          ['architecture', architecture.name],
          ['provider', provider.name],
          ['version', version.versionNumber],
          ['box', version.box.name],
        ],
        context
      );
      if (!matched || !reaches(viewer, version.box, version, provider, architecture, file)) {
        return null;
      }
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
  const { isoWhere, viewer } = context;
  const files = await IsoFile.findAll({
    where: fileWhere(
      [...FILE_FIELDS, 'architecture', '$version.versionNumber$', '$version.iso.name$'],
      context
    ),
    attributes: ['id', 'fileName', 'checksum', 'architecture', ...ROW_REACH_FIELDS],
    include: [isoVersionInclude(isoWhere)],
  });
  return files
    .map(file => {
      const { version } = file;
      const matched = matchedFile(
        file,
        [
          ['architecture', file.architecture],
          ['version', version.versionNumber],
          ['iso', version.iso.name],
        ],
        context
      );
      if (!matched || !reaches(viewer, version.iso, version, file)) {
        return null;
      }
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

const userRow = (user, org, tokens) => {
  const matched = matchedChain(own(user, USER_FIELDS), tokens);
  if (!matched) {
    return null;
  }
  return row({ kind: 'user', org, name: user.username, title: user.username, matched }, [org]);
};

const findUsers = async ({ tokens, viewer, isAdmin, managedOrgIds }) => {
  if (!viewer) {
    return [];
  }
  const where = tokenClauses(USER_FIELDS, tokens);
  if (isAdmin) {
    const users = await User.findAll({
      where,
      attributes: ['id', ...USER_FIELDS],
      include: [{ model: Organization, as: 'primaryOrganization', attributes: ['name'] }],
    });
    return users
      .map(user => userRow(user, user.primaryOrganization?.name || '', tokens))
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
    .map(membership => userRow(membership.user, membership.organization.name, tokens))
    .filter(Boolean);
};

const FINDERS = {
  organization: findOrganizations,
  item: async context => [
    ...(await findBoxes(context)),
    ...(await findIsos(context)),
    ...(await findDownloads(context)),
  ],
  version: async context => [
    ...(await findBoxVersions(context)),
    ...(await findIsoVersions(context)),
    ...(await findReleases(context)),
  ],
  provider: async context => [...(await findProviders(context)), ...(await findPatches(context))],
  architecture: async context => [
    ...(await findArchitectures(context)),
    ...(await findDownloadFiles(context)),
  ],
  artifact: async context => [...(await findBoxFiles(context)), ...(await findIsoFiles(context))],
  user: findUsers,
};

export { FINDERS };
