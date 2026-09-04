import { log } from './chrome';
import { api } from './services/api';
import { getDistroIconUrl, getOsDisplayName } from './utils/DistroIcons';
import { readDeprecated, readDeprecationReason, readReleaseNotes } from './utils/versionFields';

const { origin } = window.location;
const logoPromises = new Map();

export const organizationLogo = async organization => {
  const logo = organization.logo || organization.organization?.logo;
  if (logo) {
    return logo;
  }
  const emailHash = organization.emailHash || organization.organization?.emailHash;
  if (!emailHash) {
    return '';
  }
  const profile = await api.gravatar.profile(emailHash);
  return profile?.avatar_url || '';
};

export const fetchOrganization = async name => {
  const data = await api.organizations.get(name);
  return {
    name,
    displayName: data.display_name || '',
    logo: await organizationLogo(data),
    description: data.description || '',
    orgCode: data.external_issuer ? data.org_code || '' : '',
  };
};

export const loadOrganizations = async () => {
  const rows = (await api.users.organizations()) || [];
  return Promise.all(
    rows.map(async membership => {
      const name = membership.name || membership.organization?.name;
      return {
        uuid: name,
        name,
        description: membership.description || membership.organization?.description || '',
        roles: membership.role ? [String(membership.role).toUpperCase()] : [],
        primary: Boolean(membership.isPrimary),
        personal: Boolean(membership.personal),
        logo: await organizationLogo(membership),
      };
    })
  );
};

const logoFor = organization => {
  const name = organization?.name;
  if (!name) {
    return Promise.resolve('');
  }
  if (!logoPromises.has(name)) {
    logoPromises.set(name, organizationLogo(organization));
  }
  return logoPromises.get(name);
};

const rows = data => (Array.isArray(data) ? data : []);

const fileDownloads = files =>
  (files || []).reduce((sum, file) => sum + (file.downloadCount || 0), 0);

const architectureSummary = architecture => ({
  name: architecture.name,
  downloadCount: fileDownloads(architecture.files),
});

const providerSummary = provider => ({
  name: provider.name,
  description: provider.description || '',
  architectures: (provider.architectures || []).map(architectureSummary),
});

const versionSummary = version => ({
  version: version.versionNumber,
  createdAt: version.createdAt || null,
  updatedAt: version.updatedAt || null,
  description: version.description || '',
  releaseNotes: readReleaseNotes(version),
  deprecated: readDeprecated(version),
  deprecationReason: readDeprecationReason(version),
  providers: (version.providers || []).map(providerSummary),
  artifacts: [],
  extras: { raw: version },
});

const boxItem = (box, orgName, logo) => ({
  id: box.id ?? `${orgName}/${box.name}`,
  organization: { name: orgName, logo: logo || '' },
  name: box.name,
  label: box.name,
  description: box.shortDescription || box.description || '',
  icon: '',
  artwork: box.artwork ? `${origin}/api/organization/${orgName}/box/${box.name}/artwork` : '',
  isPublic: Boolean(box.isPublic),
  published: Boolean(box.published),
  createdAt: box.createdAt || null,
  updatedAt: box.updatedAt || null,
  latestReleaseAt: null,
  downloads: box.downloadCount || 0,
  os: {
    label: getOsDisplayName(box.metadata),
    iconUrl: getDistroIconUrl(box.metadata?.distro) || '',
  },
  metadata: box.metadata || null,
  readme: box.readme || null,
  artifact: null,
  links: {
    repo: box.githubRepo ? `https://github.com/${box.githubRepo}` : '',
    pipeline: box.cicdUrl || '',
    badge:
      box.githubRepo && box.workflowFile
        ? `https://github.com/${box.githubRepo}/actions/workflows/${box.workflowFile}/badge.svg`
        : '',
  },
  extras: { raw: box },
  versions: (box.versions || []).map(versionSummary),
});

const isoItem = (iso, orgName, logo) => ({
  id: iso.id,
  organization: { name: orgName, logo: logo || '' },
  name: iso.name,
  label: iso.name,
  description: iso.description || '',
  icon: '',
  artwork: '',
  isPublic: Boolean(iso.isPublic),
  published: Boolean(iso.published),
  createdAt: iso.createdAt || null,
  updatedAt: iso.updatedAt || null,
  latestReleaseAt: null,
  downloads: iso.downloadCount || 0,
  os: null,
  metadata: null,
  readme: null,
  artifact: {
    fileName: iso.fileName || '',
    fileSize: iso.size || 0,
    checksum: iso.checksum || '',
    checksumType: iso.checksumType || '',
    downloadUrl: '',
    downloadCount: iso.downloadCount || 0,
  },
  links: {},
  extras: { raw: iso },
  versions: [],
});

const withLogos = async (entries, fallbackOrg, toItem) => {
  const organizations = new Map();
  entries.forEach(entry => {
    const name = entry.organization?.name || fallbackOrg;
    if (!organizations.has(name)) {
      organizations.set(name, { name, ...(entry.organization || {}) });
    }
  });
  const logos = Object.fromEntries(
    await Promise.all(
      [...organizations.values()].map(async organization => [
        organization.name,
        await logoFor(organization),
      ])
    )
  );
  return entries.map(entry => {
    const name = entry.organization?.name || fallbackOrg;
    return toItem(entry, name, logos[name]);
  });
};

const providersOf = (org, name, version) =>
  api.providers
    .list(org, name, version)
    .then(data => rows(data).map(providerSummary))
    .catch(error => {
      log.api.error('Error fetching providers', { versionNumber: version, error: error.message });
      return [];
    });

const getItemSummary = async (org, name) => {
  const box = await api.boxes.get(org, name);
  return boxItem(box, org, await logoFor({ name: org, ...(box.organization || {}) }));
};

const getItem = async (org, name) => {
  const [item, versionRows] = await Promise.all([
    getItemSummary(org, name),
    api.versions.list(org, name),
  ]);
  const versions = await Promise.all(
    rows(versionRows).map(async version => ({
      ...versionSummary(version),
      providers: await providersOf(org, name, version.versionNumber),
    }))
  );
  return { ...item, versions };
};

const downloadLink = (org, name, version, provider, architecture) =>
  api.files.downloadLink(org, name, version, provider, architecture).catch(() => '');

const getVersion = async (org, name, version) => {
  const [versionData, providerRows] = await Promise.all([
    api.versions.get(org, name, version),
    api.providers.list(org, name, version),
  ]);
  const providers = await Promise.all(
    rows(providerRows).map(async provider => {
      const architectures = await api.architectures
        .list(org, name, version, provider.name)
        .then(rows)
        .catch(() => []);
      return {
        name: provider.name,
        description: provider.description || '',
        architectures: await Promise.all(
          architectures.map(async architecture => ({
            name: architecture.name,
            defaultBox: Boolean(architecture.defaultBox),
            downloadUrl: await downloadLink(org, name, version, provider.name, architecture.name),
          }))
        ),
        extras: { raw: provider },
      };
    })
  );
  return { ...versionSummary(versionData), providers };
};

const architectureDetail = async (org, name, version, provider, architecture) => {
  try {
    const [info, url] = await Promise.all([
      api.files.info(org, name, version, provider, architecture.name),
      api.files.downloadLink(org, name, version, provider, architecture.name),
    ]);
    return {
      name: architecture.name,
      defaultBox: Boolean(architecture.defaultBox),
      fileName: info.fileName || '',
      fileSize: info.fileSize || 0,
      checksum: info.checksum || '',
      checksumType: info.checksumType || '',
      downloadUrl: url,
      downloadCount: info.downloadCount || 0,
    };
  } catch (error) {
    log.api.error('Error fetching file info', {
      architectureName: architecture.name,
      error: error.message,
    });
    return {
      name: architecture.name,
      defaultBox: Boolean(architecture.defaultBox),
      fileName: '',
      fileSize: 0,
      checksum: '',
      checksumType: '',
      downloadUrl: '',
      downloadCount: 0,
    };
  }
};

const getProvider = async (org, name, version, provider) => {
  const [providerData, architectureRows] = await Promise.all([
    api.providers.get(org, name, version, provider),
    api.architectures.list(org, name, version, provider),
  ]);
  const architectures = await Promise.all(
    rows(architectureRows).map(architecture =>
      architectureDetail(org, name, version, provider, architecture)
    )
  );
  return {
    name: providerData.name,
    description: providerData.description || '',
    architectures,
    extras: { raw: providerData },
  };
};

const deleteArchitectureCascade = (org, name, version, provider, architecture) =>
  api.files
    .remove(org, name, version, provider, architecture)
    .then(() => api.architectures.remove(org, name, version, provider, architecture));

export const deleteProviderCascade = (org, name, version, provider) =>
  api.architectures
    .list(org, name, version, provider)
    .then(data =>
      Promise.all(
        rows(data).map(architecture =>
          deleteArchitectureCascade(org, name, version, provider, architecture.name)
        )
      )
    )
    .then(() => api.providers.remove(org, name, version, provider));

export const deleteVersionCascade = (org, name, version) =>
  api.providers
    .list(org, name, version)
    .then(data =>
      Promise.all(
        rows(data).map(provider => deleteProviderCascade(org, name, version, provider.name))
      )
    )
    .then(() => api.versions.remove(org, name, version));

const watches = {
  list: () => api.boxes.watches().then(data => new Set(rows(data).map(entry => entry.boxId))),
  toggle: (item, next) =>
    next
      ? api.boxes.watch(item.organization.name, item.name)
      : api.boxes.unwatch(item.organization.name, item.name),
};

export const boxesAdapter = {
  listAll: () => api.boxes.discover().then(data => withLogos(rows(data), 'Unknown', boxItem)),
  listOrg: org => api.boxes.list(org).then(data => withLogos(rows(data), org, boxItem)),
  getItem,
  getItemSummary,
  getVersion,
  getProvider,
  getOrganization: fetchOrganization,
  watches,
};

const isoList = org => api.isos.list(org).then(data => withLogos(rows(data), org, isoItem));

const getIso = async (org, name) => {
  const items = await isoList(org);
  const item = items.find(entry => entry.name === name);
  if (!item) {
    throw new Error(`${org}/${name} not found`);
  }
  return item;
};

const isoWatches = {
  list: () => api.isos.watches().then(data => new Set(rows(data).map(entry => entry.isoId))),
  toggle: (item, next) =>
    next
      ? api.isos.watch(item.organization.name, item.extras.raw.id)
      : api.isos.unwatch(item.organization.name, item.extras.raw.id),
};

export const isosAdapter = {
  listAll: () => api.isos.discover().then(data => withLogos(rows(data), 'Unknown', isoItem)),
  listOrg: isoList,
  getItem: getIso,
  getItemSummary: getIso,
  getOrganization: fetchOrganization,
  watches: isoWatches,
};
