import { fetchOrganization, organizationLogo } from './chromeProps';
import EventBus from './common/EventBus';
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

const signOutOn401 = error => {
  if (error.response?.status === 401) {
    EventBus.dispatch('logout', null);
  }
  throw error;
};

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

const sumDownloads = box =>
  (box.versions || []).reduce(
    (total, version) =>
      total +
      (version.providers || []).reduce(
        (providerTotal, provider) =>
          providerTotal +
          (provider.architectures || []).reduce(
            (architectureTotal, architecture) =>
              architectureTotal + fileDownloads(architecture.files),
            0
          ),
        0
      ),
    0
  );

const boxItem = (box, orgName, logo) => ({
  id: box.id ?? `${orgName}/${box.name}`,
  organization: { name: orgName, logo: logo || '' },
  name: box.name,
  label: box.name,
  description: box.shortDescription || box.description || '',
  icon: '',
  artwork: box.artwork ? `${origin}/api/organization/${orgName}/box/${box.name}/artwork` : '',
  isPublic: Boolean(box.public || box.isPublic),
  published: Boolean(box.published),
  createdAt: box.createdAt || null,
  latestReleaseAt: null,
  downloads: sumDownloads(box),
  os: {
    label: getOsDisplayName(box.metadata),
    iconUrl: getDistroIconUrl(box.metadata?.distro) || '',
  },
  metadata: box.metadata || null,
  readme: box.readme || null,
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

const withLogos = async (boxes, fallbackOrg) => {
  const organizations = new Map();
  boxes.forEach(box => {
    const name = box.organization?.name || fallbackOrg;
    if (!organizations.has(name)) {
      organizations.set(name, { name, ...(box.organization || {}) });
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
  return boxes.map(box => {
    const name = box.organization?.name || fallbackOrg;
    return boxItem(box, name, logos[name]);
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
    BoxService.discoverAll()
      .catch(signOutOn401)
      .then(response => withLogos(rows(response), 'Unknown')),
  listOrg: org =>
    BoxService.getAll(org)
      .catch(signOutOn401)
      .then(response => withLogos(rows(response), org)),
  getItem,
  getItemSummary,
  getVersion,
  getProvider,
  getOrganization: fetchOrganization,
  watches,
};

const isoItem = (iso, fallbackOrg) => ({
  id: iso.id,
  organization: { name: iso.organization?.name || fallbackOrg, logo: iso.organization?.logo || '' },
  name: iso.name,
  label: iso.name,
  description: '',
  icon: '',
  artwork: '',
  isPublic: Boolean(iso.isPublic),
  published: null,
  createdAt: iso.createdAt || null,
  latestReleaseAt: null,
  downloads: null,
  os: null,
  metadata: null,
  readme: null,
  links: {},
  extras: { raw: iso, size: iso.size, checksum: iso.checksum },
  versions: [],
});

export const isosAdapter = {
  listAll: () =>
    IsoService.discoverAll().then(response => rows(response).map(iso => isoItem(iso, 'Unknown'))),
  listOrg: (org, { member }) =>
    (member ? IsoService.getAll(org) : IsoService.getPublic(org)).then(response =>
      rows(response).map(iso => isoItem(iso, org))
    ),
  getOrganization: fetchOrganization,
};
