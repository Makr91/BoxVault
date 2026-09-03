import PropTypes from 'prop-types';

export const architectureShape = PropTypes.shape({
  name: PropTypes.string.isRequired,
  defaultBox: PropTypes.bool,
  fileName: PropTypes.string,
  fileSize: PropTypes.number,
  checksum: PropTypes.string,
  checksumType: PropTypes.string,
  downloadUrl: PropTypes.string,
  downloadCount: PropTypes.number,
});

export const artifactShape = PropTypes.shape({
  fileName: PropTypes.string,
  fileSize: PropTypes.number,
  checksum: PropTypes.string,
  checksumType: PropTypes.string,
  downloadUrl: PropTypes.string,
  downloadCount: PropTypes.number,
});

export const providerShape = PropTypes.shape({
  name: PropTypes.string.isRequired,
  description: PropTypes.string,
  architectures: PropTypes.arrayOf(architectureShape),
  extras: PropTypes.object,
});

export const versionShape = PropTypes.shape({
  version: PropTypes.string.isRequired,
  createdAt: PropTypes.string,
  updatedAt: PropTypes.string,
  description: PropTypes.string,
  releaseNotes: PropTypes.string,
  deprecated: PropTypes.bool,
  deprecationReason: PropTypes.string,
  providers: PropTypes.arrayOf(providerShape),
  artifacts: PropTypes.arrayOf(architectureShape),
  extras: PropTypes.object,
});

export const organizationShape = PropTypes.shape({
  name: PropTypes.string.isRequired,
  uuid: PropTypes.string,
  logo: PropTypes.string,
  displayName: PropTypes.string,
  description: PropTypes.string,
});

export const itemShape = PropTypes.shape({
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  organization: organizationShape.isRequired,
  name: PropTypes.string.isRequired,
  label: PropTypes.string,
  description: PropTypes.string,
  icon: PropTypes.string,
  artwork: PropTypes.string,
  isPublic: PropTypes.bool,
  published: PropTypes.bool,
  createdAt: PropTypes.string,
  updatedAt: PropTypes.string,
  latestReleaseAt: PropTypes.string,
  downloads: PropTypes.number,
  os: PropTypes.shape({ label: PropTypes.string, iconUrl: PropTypes.string }),
  metadata: PropTypes.object,
  readme: PropTypes.string,
  artifact: artifactShape,
  links: PropTypes.object,
  extras: PropTypes.object,
  versions: PropTypes.arrayOf(versionShape),
});

export const filterGroupShape = PropTypes.shape({
  key: PropTypes.string.isRequired,
  labelKey: PropTypes.string.isRequired,
  values: PropTypes.func.isRequired,
  activeClass: PropTypes.string.isRequired,
  pillClass: PropTypes.func,
  labelFor: PropTypes.func,
  order: PropTypes.arrayOf(PropTypes.string),
  signedInOnly: PropTypes.bool,
  homeOnly: PropTypes.bool,
  orgOnly: PropTypes.bool,
  shownFor: PropTypes.func,
});

export const VISIBILITY_GROUP = {
  key: 'visibility',
  labelKey: 'pages.table.visibility',
  values: item => [item.isPublic === false ? 'private' : 'public'],
  activeClass: 'bg-info',
  labelFor: (value, t) => t(`pages.status.${value}`),
  order: ['public', 'private'],
  shownFor: items => items.some(item => item.isPublic === false),
};

export const WATCHED_GROUP = {
  key: 'watched',
  labelKey: 'pages.watch.filterWatched',
  values: (item, ctx) => (ctx.watchedIds.has(item.id) ? ['watched'] : []),
  activeClass: 'bg-warning text-dark',
  labelFor: (value, t) => t(`pages.watch.${value}`),
};

const SHARED_GROUP_KEYS = [VISIBILITY_GROUP.key, WATCHED_GROUP.key];

export const filterGroupsOf = collection =>
  collection.filterGroups.filter(group => !SHARED_GROUP_KEYS.includes(group.key));

export const isPrivate = item => item.isPublic === false;

export const columnShape = PropTypes.shape({
  key: PropTypes.string.isRequired,
  labelKey: PropTypes.string,
  sortValue: PropTypes.func,
  render: PropTypes.func.isRequired,
  when: PropTypes.func,
});

export const collectionShape = PropTypes.shape({
  key: PropTypes.string.isRequired,
  labelKey: PropTypes.string.isRequired,
  countKey: PropTypes.string.isRequired,
  icon: PropTypes.node,
  segment: PropTypes.string.isRequired,
  hasVersions: PropTypes.bool.isRequired,
  itemRoute: PropTypes.bool.isRequired,
  searchKey: PropTypes.string.isRequired,
  defaultView: PropTypes.oneOf(['table', 'cards']).isRequired,
  adapter: PropTypes.object.isRequired,
  filterGroups: PropTypes.arrayOf(filterGroupShape).isRequired,
  columns: PropTypes.arrayOf(columnShape).isRequired,
  matches: PropTypes.func,
  canManage: PropTypes.func,
  slots: PropTypes.object.isRequired,
});

export const pageContextShape = PropTypes.shape({
  user: PropTypes.object,
  orgMark: PropTypes.node,
  prefsPrefix: PropTypes.string.isRequired,
  appName: PropTypes.string.isRequired,
  formatFileSize: PropTypes.func.isRequired,
});

export const statusOf = item => {
  if (typeof item.published !== 'boolean') {
    return null;
  }
  return item.published ? 'published' : 'pending';
};

export const visibilityOf = item => {
  if (typeof item.isPublic !== 'boolean') {
    return null;
  }
  return item.isPublic ? 'public' : 'private';
};

export const sortVersionsNewestFirst = versions =>
  [...versions].sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

export const latestReleaseTime = item => {
  const versions = item.versions || [];
  const latest = versions.reduce((newest, version) => {
    const time = new Date(version.createdAt || 0).getTime();
    return Number.isNaN(time) ? newest : Math.max(newest, time);
  }, 0);
  return latest || null;
};

export const providerNames = item => [
  ...new Set((item.versions || []).flatMap(version => (version.providers || []).map(p => p.name))),
];

export const architectureNames = item => [
  ...new Set(
    (item.versions || []).flatMap(version =>
      (version.providers || []).flatMap(provider =>
        (provider.architectures || []).map(architecture => architecture.name)
      )
    )
  ),
];

export const defaultMatches = (item, needle) =>
  [item.name, item.label || '', item.description || '', item.organization.name].some(text =>
    text.toLowerCase().includes(needle)
  );

export const responseMessage = (error, fallback) => error?.response?.data?.message || fallback;

export const formatFileSize = bytes => {
  const size = Number(bytes) || 0;
  if (size === 0) {
    return '0 Bytes';
  }
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(size) / Math.log(k));
  return `${parseFloat((size / k ** i).toFixed(2))} ${sizes[i]}`;
};
