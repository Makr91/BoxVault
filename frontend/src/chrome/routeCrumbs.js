export const collectionPath = (collection, org) => {
  const base = org ? `/${org}` : '';
  const segment = collection.segment ? `/${collection.segment}` : '';
  return `${base}${segment}` || '/';
};

export const itemPath = (collection, org, name) =>
  `${collectionPath(collection, org).replace(/\/$/, '')}/${name}`;

export const versionPath = (collection, org, name, version) =>
  `${itemPath(collection, org, name)}/${version}`;

export const providerPath = (collection, org, name, version, provider) =>
  `${versionPath(collection, org, name, version)}/${provider}`;

const emptyRoute = { org: '', collection: null, item: '', version: '', provider: '' };

/**
 * Reads the current path as the shared page levels. Returns null on a
 * reserved first segment (an app page that is not an organization), the
 * empty route on the home page, and otherwise the organization, the
 * collection (the implicit one when the route carries no segment for it),
 * the item, the version and the provider.
 */
export const parseRoute = (pathname, { reserved, collections }) => {
  const segments = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (segments.length === 0) {
    return emptyRoute;
  }
  const [first, ...rest] = segments;
  const topCollection = collections.find(entry => entry.segment && entry.segment === first);
  if (topCollection) {
    return { ...emptyRoute, collection: topCollection };
  }
  if (reserved.includes(first)) {
    return null;
  }
  const explicit = collections.find(entry => entry.segment && entry.segment === rest[0]);
  const tail = explicit ? rest.slice(1) : rest;
  const implicit = collections.find(entry => !entry.segment) || null;
  const collection = explicit || (tail.length > 0 ? implicit : null);
  return {
    org: first,
    collection,
    item: tail[0] || '',
    version: tail[1] || '',
    provider: tail[2] || '',
  };
};

export const buildRouteCrumbs = ({ route, t, orgIcon }) => {
  if (!route) {
    return [];
  }
  const { org, collection, item, version, provider } = route;
  const crumbs = [];
  if (org) {
    crumbs.push({ key: 'org', icon: orgIcon, label: org, to: `/${org}` });
  }
  if (collection) {
    crumbs.push({
      key: 'collection',
      icon: collection.icon,
      label: t(collection.labelKey),
      to: collectionPath(collection, org),
    });
  }
  if (item) {
    crumbs.push({ key: 'item', label: item, to: itemPath(collection, org, item) });
  }
  if (version) {
    crumbs.push({
      key: 'version',
      label: version,
      to: versionPath(collection, org, item, version),
    });
  }
  if (provider) {
    crumbs.push({
      key: 'provider',
      label: provider,
      to: providerPath(collection, org, item, version, provider),
    });
  }
  return crumbs;
};
