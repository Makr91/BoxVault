import { fetchOrganization, organizationLogo } from './chromeProps';
import ArchitectureService from './services/architecture.service';
import BoxService from './services/box.service';
import FileService from './services/file.service';
import IsoService from './services/iso.service';
import ProviderService from './services/provider.service';
import VersionService from './services/version.service';
import { getDistroIconUrl, getOsDisplayName } from './utils/DistroIcons';
import { log } from './utils/Logger';
import { readDeprecated, readDeprecationReason, readReleaseNotes } from './utils/versionFields';

const { origin } = window.location;
const logoPromises = new Map();

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

const rows = response => (Array.isArray(response.data) ? response.data : []);

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
  ProviderService.getProviders(org, name, version)
    .then(response => rows(response).map(providerSummary))
    .catch(error => {
      log.api.error('Error fetching providers', { versionNumber: version, error: error.message });
      return [];
    });

const getItemSummary = async (org, name) => {
  const response = await BoxService.get(org, name);
  const box = response.data;
  return boxItem(box, org, await logoFor({ name: org, ...(box.organization || {}) }));
};

const getItem = async (org, name) => {
  const [item, versionsResponse] = await Promise.all([
    getItemSummary(org, name),
    VersionService.getVersions(org, name),
  ]);
  const versions = await Promise.all(
    rows(versionsResponse).map(async version => ({
      ...versionSummary(version),
      providers: await providersOf(org, name, version.versionNumber),
    }))
  );
  return { ...item, versions };
};

const downloadLink = (org, name, version, provider, architecture) =>
  FileService.getDownloadLink(org, name, version, provider, architecture).catch(() => '');

const getVersion = async (org, name, version) => {
  const [versionResponse, providersResponse] = await Promise.all([
    VersionService.getVersion(org, name, version),
    ProviderService.getProviders(org, name, version),
  ]);
  const providers = await Promise.all(
    rows(providersResponse).map(async provider => {
      const architectures = await ArchitectureService.getArchitectures(
        org,
        name,
        version,
        provider.name
      )
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
  return { ...versionSummary(versionResponse.data), providers };
};

const architectureDetail = async (org, name, version, provider, architecture) => {
  try {
    const [info, url] = await Promise.all([
      FileService.info(org, name, version, provider, architecture.name),
      FileService.getDownloadLink(org, name, version, provider, architecture.name),
    ]);
    return {
      name: architecture.name,
      defaultBox: Boolean(architecture.defaultBox),
      fileName: info.data.fileName || '',
      fileSize: info.data.fileSize || 0,
      checksum: info.data.checksum || '',
      checksumType: info.data.checksumType || '',
      downloadUrl: url,
      downloadCount: info.data.downloadCount || 0,
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
  const [providerResponse, architecturesResponse] = await Promise.all([
    ProviderService.getProvider(org, name, version, provider),
    ArchitectureService.getArchitectures(org, name, version, provider),
  ]);
  const architectures = await Promise.all(
    rows(architecturesResponse).map(architecture =>
      architectureDetail(org, name, version, provider, architecture)
    )
  );
  return {
    name: providerResponse.data.name,
    description: providerResponse.data.description || '',
    architectures,
    extras: { raw: providerResponse.data },
  };
};

const deleteArchitectureCascade = (org, name, version, provider, architecture) =>
  FileService.delete(org, name, version, provider, architecture).then(() =>
    ArchitectureService.deleteArchitecture(org, name, version, provider, architecture)
  );

export const deleteProviderCascade = (org, name, version, provider) =>
  ArchitectureService.getArchitectures(org, name, version, provider)
    .then(response =>
      Promise.all(
        rows(response).map(architecture =>
          deleteArchitectureCascade(org, name, version, provider, architecture.name)
        )
      )
    )
    .then(() => ProviderService.deleteProvider(org, name, version, provider));

export const deleteVersionCascade = (org, name, version) =>
  ProviderService.getProviders(org, name, version)
    .then(response =>
      Promise.all(
        rows(response).map(provider => deleteProviderCascade(org, name, version, provider.name))
      )
    )
    .then(() => VersionService.deleteVersion(org, name, version));

const watches = {
  list: () =>
    BoxService.getUserWatches().then(response => new Set(rows(response).map(entry => entry.boxId))),
  toggle: (item, next) =>
    next
      ? BoxService.watch(item.organization.name, item.name)
      : BoxService.unwatch(item.organization.name, item.name),
};

export const boxesAdapter = {
  listAll: () =>
    BoxService.discoverAll().then(response => withLogos(rows(response), 'Unknown', boxItem)),
  listOrg: org => BoxService.getAll(org).then(response => withLogos(rows(response), org, boxItem)),
  getItem,
  getItemSummary,
  getVersion,
  getProvider,
  getOrganization: fetchOrganization,
  watches,
};

const isoList = org =>
  IsoService.getAll(org).then(response => withLogos(rows(response), org, isoItem));

const getIso = async (org, name) => {
  const items = await isoList(org);
  const item = items.find(entry => entry.name === name);
  if (!item) {
    throw new Error(`${org}/${name} not found`);
  }
  return item;
};

const isoWatches = {
  list: () =>
    IsoService.getUserWatches().then(response => new Set(rows(response).map(entry => entry.isoId))),
  toggle: (item, next) =>
    next
      ? IsoService.watch(item.organization.name, item.extras.raw.id)
      : IsoService.unwatch(item.organization.name, item.extras.raw.id),
};

export const isosAdapter = {
  listAll: () =>
    IsoService.discoverAll().then(response => withLogos(rows(response), 'Unknown', isoItem)),
  listOrg: isoList,
  getItem: getIso,
  getItemSummary: getIso,
  getOrganization: fetchOrganization,
  watches: isoWatches,
};
