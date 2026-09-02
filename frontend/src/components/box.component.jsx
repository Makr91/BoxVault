import PropTypes from 'prop-types';
import { useState, useEffect, useRef } from 'react';
import { Table } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaStar, FaRegStar, FaRocket } from 'react-icons/fa6';
import Markdown from 'react-markdown';
import { useParams, useNavigate, Link } from 'react-router-dom';

import ArchitectureService from '../services/architecture.service';
import AuthService from '../services/auth.service';
import BoxDataService from '../services/box.service';
import FileService from '../services/file.service';
import ProviderService from '../services/provider.service';
import VersionDataService from '../services/version.service';
import { getDistroIconUrl, getOsDisplayName } from '../utils/DistroIcons';
import { log } from '../utils/Logger';
import { canManageBox } from '../utils/permissions';
import { readDeprecated } from '../utils/versionFields';

import BoxPageHeader from './BoxPageHeader.component';
import ConfirmationModal from './confirmation.component';
import StatusChips from './StatusChips.component';

// metadata.memory_mb display: GB when >= 1024, MB below.
const formatMemoryDisplay = memoryMb => {
  const mb = Number(memoryMb);
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }
  return `${mb} MB`;
};

// Hosts.yml memory format ("8G" style, like the core_provisioner examples).
const formatHostsMemory = memoryMb => {
  const mb = Number(memoryMb);
  return mb % 1024 === 0 ? `${mb / 1024}G` : `${mb}M`;
};

// One disk/cdrom entry as "name · size · controller" (present parts only).
const formatDiskEntry = entry => {
  if (typeof entry === 'string') {
    return entry;
  }
  if (!entry || typeof entry !== 'object') {
    return String(entry ?? '');
  }
  return [entry.name, entry.size, entry.controller].filter(Boolean).join(' · ');
};

const hasHyperweaverEntitlement = user =>
  Array.isArray(user?.entitlements) &&
  user.entitlements.some(
    entitlement =>
      typeof entitlement.value === 'string' && entitlement.value.startsWith('hyperweaver')
  );

const sortVersionsNewestFirst = versionList =>
  [...versionList].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

// Default picker choice: latest non-deprecated version, else latest.
const pickDefaultVersion = versionList => {
  if (!Array.isArray(versionList) || versionList.length === 0) {
    return null;
  }
  const sorted = sortVersionsNewestFirst(versionList);
  const active = sorted.find(version => !readDeprecated(version));
  return (active || sorted[0]).versionNumber;
};

// Verbatim copy of the self-bootstrapping core_provisioner Vagrantfile
// (G:\Projects\mpp2\Vagrantfile). Do not reformat.
const STARTER_VAGRANTFILE = `## Vagrant File tooling compatabile with Bhyve and Virtualbox, potentially ESXI/Vmware,KVM
##
## Self-bootstrapping driver: when driver/ is missing, the pinned
## core_provisioner release named in driver.version is downloaded, verified
## against its .sha256 sidecar, and extracted before Hosts.rb is required.
## The pin file is the single authority for this bootstrap AND the consumer's
## build CI — always an exact tag, never a floating branch.
require 'yaml'
require 'digest'
require 'fileutils'
require 'net/http'
require 'uri'
require 'tmpdir'

def download(url, dest, limit = 5)
  raise "Too many redirects fetching #{url}" if limit.zero?

  uri = URI(url)
  Net::HTTP.start(uri.host, uri.port, use_ssl: true) do |http|
    http.request(Net::HTTP::Get.new(uri)) do |response|
      case response
      when Net::HTTPRedirection
        return download(response['location'], dest, limit - 1)
      when Net::HTTPSuccess
        File.open(dest, 'wb') { |file| response.read_body { |chunk| file.write(chunk) } }
      else
        raise "Download failed (HTTP #{response.code}) for #{url}"
      end
    end
  end
end

root = File.dirname(__FILE__)
driver_dir = File.join(root, 'driver')

unless File.file?(File.join(driver_dir, 'Hosts.rb'))
  pin_file = File.join(root, 'driver.version')
  unless File.file?(pin_file)
    raise "driver/ is missing and no driver.version pin file exists — create driver.version containing the pinned core_provisioner release tag (for example: v0.3.0)"
  end

  tag = File.read(pin_file).strip
  version = tag.sub(/\\Av/, '')
  archive_name = "core_provisioner-#{version}.tar.gz"
  base_url = "https://github.com/STARTcloud/core_provisioner/releases/download/#{tag}"

  Dir.mktmpdir('core_provisioner') do |tmp|
    archive = File.join(tmp, archive_name)
    sidecar = "#{archive}.sha256"
    puts "==> driver/ is missing — fetching core_provisioner #{tag}"
    download("#{base_url}/#{archive_name}", archive)
    download("#{base_url}/#{archive_name}.sha256", sidecar)

    expected = File.read(sidecar).split.first
    actual = Digest::SHA256.file(archive).hexdigest
    raise "Checksum mismatch for #{archive_name}: expected #{expected}, got #{actual}" unless expected == actual

    system('tar', '-xzf', archive, '-C', root) || raise("Extraction of #{archive_name} failed")
  end
end

require File.expand_path(File.join(root, 'driver', 'Hosts.rb'))

settings = YAML::load(File.read(File.join(root, 'Hosts.yml')))

Vagrant.configure("2") do |config|
  Hosts.configure(config, settings)
end
`;

// Hosts.yml for the starter kit, pre-filled from the box facts.
const buildStarterHostsYml = ({ boxTag, origin, versionPin, metadata }) => {
  const meta = metadata || {};
  const lines = [
    '---',
    'hosts:',
    '  -',
    '    settings:',
    `      box: '${boxTag}'`,
    `      box_url: '${origin}'`,
    `      box_version: ${versionPin}`,
  ];
  const [firstProvider] = Array.isArray(meta.providers) ? meta.providers : [];
  if (firstProvider) {
    lines.push(`      provider_type: ${firstProvider}`);
  }
  if (meta.cpus) {
    lines.push(`      vcpus: ${meta.cpus}`);
  }
  if (meta.memory_mb) {
    lines.push(`      memory: ${formatHostsMemory(meta.memory_mb)}`);
  }
  if (meta.username) {
    lines.push(`      vagrant_user: ${meta.username}`);
  }
  const driverVersion = meta.core_provisioner_version || meta.driver_version;
  if (driverVersion) {
    lines.push(`      driver_version: ${driverVersion}`);
  }
  return `${lines.join('\n')}\n`;
};

// Save a generated text file via a temporary object-URL anchor.
const downloadTextFile = (fileName, content) => {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const CopyButton = ({ text }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      error => {
        log.component.error('Could not copy text to clipboard', {
          error: error.message,
        });
      }
    );
  };

  return (
    <button
      type="button"
      className={`btn btn-sm ${copied ? 'btn-success' : 'btn-outline-light'}`}
      onClick={handleCopy}
    >
      {copied ? t('box.useThisBox.copied') : t('buttons.copy')}
    </button>
  );
};

CopyButton.propTypes = {
  text: PropTypes.string.isRequired,
};

const CodeBlock = ({ code, downloadFileName }) => {
  const { t } = useTranslation();
  return (
    <div className="bg-dark text-light rounded p-3 mb-2 d-flex align-items-start gap-2">
      <pre className="text-light mb-0 overflow-auto flex-grow-1">
        <code>{code}</code>
      </pre>
      <div className="d-flex flex-column gap-2">
        <CopyButton text={code} />
        {downloadFileName && (
          <button
            type="button"
            className="btn btn-sm btn-outline-light"
            onClick={() => downloadTextFile(downloadFileName, code)}
          >
            {t('buttons.download')}
          </button>
        )}
      </div>
    </div>
  );
};

CodeBlock.propTypes = {
  code: PropTypes.string.isRequired,
  downloadFileName: PropTypes.string,
};

// One label/value row of the box-facts display.
const BoxFactRow = ({ label, children }) => (
  <div className="row mb-1">
    <dt className="col-sm-4">{label}</dt>
    <dd className="col-sm-8 mb-1">{children}</dd>
  </div>
);

BoxFactRow.propTypes = {
  label: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
};

// Password fact row: masked by default with a show/hide toggle.
const PasswordFactRow = ({ password }) => {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);

  return (
    <div className="row mb-1">
      <dt className="col-sm-4">{t('box.facts.password')}</dt>
      <dd className="col-sm-8 mb-1">
        <code className="me-2">{show ? password : '••••••••'}</code>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={() => setShow(!show)}
        >
          {show ? t('box.facts.hide') : t('box.facts.show')}
        </button>
      </dd>
    </div>
  );
};

PasswordFactRow.propTypes = {
  password: PropTypes.string.isRequired,
};

// Assemble the visible fact rows in display order; absent facts are skipped.
const buildBoxFactRows = (metadata, t) => {
  const rows = [];
  const osLabel = getOsDisplayName(metadata);
  const osIconUrl = getDistroIconUrl(metadata.distro);
  if (osIconUrl || osLabel) {
    rows.push({
      key: 'os',
      content: (
        <>
          {osIconUrl && (
            <img
              src={osIconUrl}
              alt=""
              className="rounded-circle me-2"
              style={{ width: 30, height: 30 }}
            />
          )}
          {osLabel}
        </>
      ),
    });
  }
  let desktopLabel = null;
  if (typeof metadata.desktop === 'boolean') {
    desktopLabel = t(metadata.desktop ? 'box.facts.desktop' : 'box.facts.server');
  }
  const typeValue = [metadata.vm_type, desktopLabel].filter(Boolean).join(' · ');
  if (typeValue) {
    rows.push({ key: 'type', content: typeValue });
  }
  if (metadata.username) {
    rows.push({ key: 'username', content: <code>{metadata.username}</code> });
  }
  if (metadata.password) {
    rows.push({ key: 'password', value: metadata.password });
  }
  if (metadata.communicator) {
    rows.push({ key: 'communicator', content: metadata.communicator });
  }
  if (metadata.cpus) {
    rows.push({ key: 'cpus', content: metadata.cpus });
  }
  if (metadata.memory_mb) {
    rows.push({
      key: 'memory',
      content: formatMemoryDisplay(metadata.memory_mb),
    });
  }
  const disks = Array.isArray(metadata.disks) ? metadata.disks : [];
  const cdroms = Array.isArray(metadata.cdroms) ? metadata.cdroms : [];
  const diskEntries = [...disks, ...cdroms].map(formatDiskEntry);
  if (diskEntries.length > 0) {
    rows.push({
      key: 'disks',
      content: diskEntries.map(entry => <div key={entry}>{entry}</div>),
    });
  }
  if (Array.isArray(metadata.providers) && metadata.providers.length > 0) {
    rows.push({ key: 'providers', content: metadata.providers.join(', ') });
  }
  if (metadata.built) {
    rows.push({ key: 'built', content: metadata.built });
  }
  const driverValue = metadata.core_provisioner_version || metadata.driver_version;
  if (driverValue) {
    rows.push({ key: 'driver', content: driverValue });
  }
  return rows;
};

// BOX FACTS panel: two-column dl rows built from box.metadata.
const BoxFacts = ({ metadata }) => {
  const { t } = useTranslation();
  const rows = buildBoxFactRows(metadata, t);
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="card h-100">
      <div className="card-header">
        <h5 className="mb-0">{t('box.facts.title')}</h5>
      </div>
      <div className="card-body">
        <dl className="mb-0">
          {rows.map(row =>
            row.key === 'password' ? (
              <PasswordFactRow key="password" password={row.value} />
            ) : (
              <BoxFactRow key={row.key} label={t(`box.facts.${row.key}`)}>
                {row.content}
              </BoxFactRow>
            )
          )}
        </dl>
      </div>
    </div>
  );
};

BoxFacts.propTypes = {
  metadata: PropTypes.object.isRequired,
};

// USE-THIS-BOX strip: vagrant init command, a pinned-Vagrantfile option, and
// the self-bootstrapping starter kit with a generated Hosts.yml.
const UseThisBox = ({
  organization,
  boxName,
  metadata,
  versions,
  selectedVersion,
  onSelectVersion,
}) => {
  const { t } = useTranslation();
  const { origin } = window.location;
  const boxTag = `${organization}/${boxName}`;
  const metadataUrl = `${origin}/${organization}/boxes/${boxName}`;
  const versionPin = selectedVersion.replace(/^v/, '');
  const initCommand = `vagrant init ${boxTag} ${metadataUrl}\nvagrant up`;
  const pinnedVagrantfile = [
    `Vagrant.configure("2") do |config|`,
    `  config.vm.box = "${boxTag}"`,
    `  config.vm.box_url = "${metadataUrl}"`,
    `  config.vm.box_version = "${versionPin}"`,
    'end',
    '',
  ].join('\n');
  const hostsYml = buildStarterHostsYml({
    boxTag,
    origin,
    versionPin,
    metadata,
  });

  return (
    <div className="bg-dark text-light rounded p-3 mb-4">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
        <span className="text-uppercase small fw-semibold text-white-50">
          {t('box.useThisBox.title')}
        </span>
        <label
          className="mb-0 small text-white-50 d-flex align-items-center gap-2"
          htmlFor="useThisBoxVersion"
        >
          {t('box.useThisBox.version')}
          <select
            id="useThisBoxVersion"
            className="form-select form-select-sm w-auto"
            value={selectedVersion}
            onChange={e => onSelectVersion(e.target.value)}
          >
            {versions.map(version => (
              <option key={version.id || version.versionNumber} value={version.versionNumber}>
                {version.versionNumber}
                {readDeprecated(version) ? ` (${t('version.deprecated')})` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      <CodeBlock code={initCommand} />
      <details className="mb-2">
        <summary>{t('box.useThisBox.option2')}</summary>
        <div className="mt-2">
          <CodeBlock code={pinnedVagrantfile} />
        </div>
      </details>
      <details>
        <summary>{t('box.useThisBox.starterKit')}</summary>
        <div className="mt-2">
          <p className="mb-1">{t('box.useThisBox.starterStep1')}</p>
          <CodeBlock code={`vagrant box add ${boxTag} ${metadataUrl}`} />
          <p className="mb-1">
            <code>Vagrantfile</code>
          </p>
          <CodeBlock code={STARTER_VAGRANTFILE} downloadFileName="Vagrantfile" />
          <p className="mb-1">
            <code>Hosts.yml</code>
          </p>
          <CodeBlock code={hostsYml} downloadFileName="Hosts.yml" />
        </div>
      </details>
    </div>
  );
};

UseThisBox.propTypes = {
  organization: PropTypes.string.isRequired,
  boxName: PropTypes.string.isRequired,
  metadata: PropTypes.object,
  versions: PropTypes.arrayOf(PropTypes.object).isRequired,
  selectedVersion: PropTypes.string.isRequired,
  onSelectVersion: PropTypes.func.isRequired,
};

// README rendered as Markdown; raw HTML stays escaped (react-markdown
// defaults) as the sanitization stance.
const BoxReadme = ({ readme }) => {
  const { t } = useTranslation();
  return (
    <div className="card h-100">
      <div className="card-header">
        <h5 className="mb-0">{t('box.readmeTitle')}</h5>
      </div>
      <div className="card-body">
        <Markdown>{readme}</Markdown>
      </div>
    </div>
  );
};

BoxReadme.propTypes = {
  readme: PropTypes.string.isRequired,
};

const DeployToHyperweaverButton = ({
  user,
  hyperweaverUrl,
  organization,
  boxName,
  selectedVersion,
}) => {
  const { t } = useTranslation();
  const eligible = user && hyperweaverUrl && selectedVersion && hasHyperweaverEntitlement(user);
  if (!eligible) {
    return null;
  }
  const href = `${hyperweaverUrl}/?create=machine&box=${encodeURIComponent(`${organization}/${boxName}`)}&box_version=${encodeURIComponent(selectedVersion)}&box_arch=amd64&box_url=${encodeURIComponent(window.location.origin)}`;
  return (
    <a
      className="btn btn-primary me-2"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={t('box.hyperweaver.deployTitle')}
    >
      <FaRocket className="me-2" />
      {t('box.hyperweaver.deploy')}
    </a>
  );
};

DeployToHyperweaverButton.propTypes = {
  user: PropTypes.object,
  hyperweaverUrl: PropTypes.string.isRequired,
  organization: PropTypes.string.isRequired,
  boxName: PropTypes.string.isRequired,
  selectedVersion: PropTypes.string,
};

const WatchStarButton = ({ watched, disabled, onToggle }) => {
  const { t } = useTranslation();
  const label = watched ? t('watch.unwatch') : t('watch.watch');
  return (
    <button
      type="button"
      className="btn btn-link p-0 text-warning fs-5 v-align-middle"
      onClick={onToggle}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={watched}
    >
      {watched ? <FaStar /> : <FaRegStar />}
    </button>
  );
};

WatchStarButton.propTypes = {
  watched: PropTypes.bool.isRequired,
  disabled: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
};

const BoxHero = ({ organization, boxName, box, watchControl, actions, cicdBar }) => {
  const osLabel = getOsDisplayName(box.metadata);
  const media = box.artwork ? (
    <img
      src={`${window.location.origin}/api/organization/${organization}/box/${boxName}/artwork`}
      alt=""
      className="rounded"
      style={{ width: 236, maxWidth: '100%' }}
    />
  ) : null;
  const title = (
    <>
      {box.name}
      {watchControl && <span className="ms-2 align-middle">{watchControl}</span>}
    </>
  );
  const chips = (
    <StatusChips
      status={box.published ? 'published' : 'pending'}
      visibility={box.isPublic ? 'public' : 'private'}
      osLabel={osLabel || null}
    />
  );

  return (
    <BoxPageHeader
      crumbs={[{ label: organization, to: `/${organization}` }, { label: box.name }]}
      actions={actions}
      media={media}
      title={title}
      subtitle={`${organization} / ${box.name}`}
      chips={chips}
    >
      {(box.shortDescription || box.description) && (
        <p className="mb-0 mt-2">{box.shortDescription || box.description}</p>
      )}
      {cicdBar}
    </BoxPageHeader>
  );
};

BoxHero.propTypes = {
  organization: PropTypes.string.isRequired,
  boxName: PropTypes.string.isRequired,
  box: PropTypes.object.isRequired,
  watchControl: PropTypes.node,
  actions: PropTypes.node,
  cicdBar: PropTypes.node,
};

// Add-version header controls (toggle + save), shown to managers only.
const AddVersionControls = ({ show, onToggleShow, onSave, newVersion, validationErrors }) => {
  const { t } = useTranslation();
  const saveDisabled = !newVersion.versionNumber || !!validationErrors.versionNumber;
  return (
    <div>
      <button
        className={`btn ${show ? 'btn-secondary' : 'btn-outline-success'} me-2`}
        onClick={onToggleShow}
      >
        {show ? t('buttons.cancel') : t('version.add')}
      </button>
      {show && (
        <button type="button" className="btn btn-success" onClick={onSave} disabled={saveDisabled}>
          {t('buttons.save')}
        </button>
      )}
    </div>
  );
};

AddVersionControls.propTypes = {
  show: PropTypes.bool.isRequired,
  onToggleShow: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  newVersion: PropTypes.object.isRequired,
  validationErrors: PropTypes.object.isRequired,
};

const Box = ({ theme }) => {
  const { t } = useTranslation();
  const { organization, name } = useParams();
  const [versions, setVersions] = useState([]);
  const [originalName, setOriginalName] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [versionToDelete, setVersionToDelete] = useState(null);
  const navigate = useNavigate();
  log.component.debug('Box component theme', { theme });
  const initialBoxState = {
    id: null,
    name: '',
    description: '',
    published: false,
    isPublic: false,
    userId: null,
    organization: null,
    githubRepo: '',
    workflowFile: '',
    cicdUrl: '',
  };

  const [currentUser, setCurrentUser] = useState(null);
  const [currentBox, setCurrentBox] = useState(initialBoxState);
  const [boxOrganization, setBoxOrganization] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [showAddVersionForm, setShowAddVersionForm] = useState(false);
  const [newVersion, setNewVersion] = useState({
    versionNumber: '',
    description: '',
  });
  const [providers, setProviders] = useState({});
  const [allVersions, setAllVersions] = useState([]);
  const [validationErrors, setValidationErrors] = useState({});
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState('');
  const [watched, setWatched] = useState(false);
  const [watchBusy, setWatchBusy] = useState(false);
  const [hyperweaverUrl, setHyperweaverUrl] = useState('');

  const form = useRef();

  const required = value => (value ? undefined : t('validation.required'));

  const validCharsRegex = /^[0-9a-zA-Z-._]+$/;

  const validateName = value =>
    validCharsRegex.test(value) ? undefined : t('validation.invalidName');

  const deleteFilesForArchitecture = async (providerName, versionNumber, architectureName) => {
    await FileService.delete(
      organization,
      currentBox.name,
      versionNumber,
      providerName,
      architectureName
    ).catch(e => {
      log.file.error('Error deleting files for architecture', {
        architectureName,
        error: e.message,
      });
      throw e;
    });
  };

  const deleteArchitecturesForProvider = async (providerName, versionNumber) => {
    const architectures = await ArchitectureService.getArchitectures(
      organization,
      currentBox.name,
      versionNumber,
      providerName
    );
    for (const architecture of architectures.data) {
      log.component.debug('Deleting architecture', {
        architectureName: architecture.name,
        provider: providerName,
      });
      // eslint-disable-next-line no-await-in-loop
      await deleteFilesForArchitecture(providerName, versionNumber, architecture.name);
      // eslint-disable-next-line no-await-in-loop
      await ArchitectureService.deleteArchitecture(
        organization,
        currentBox.name,
        versionNumber,
        providerName,
        architecture.name
      ).catch(e => {
        log.component.error('Error deleting architecture', {
          architectureName: architecture.name,
          error: e.message,
        });
        throw e;
      });
    }
  };

  const deleteProvidersForVersion = async versionNumber => {
    const versionProviders = await ProviderService.getProviders(
      organization,
      currentBox.name,
      versionNumber
    );
    for (const provider of versionProviders.data) {
      log.component.debug('Deleting provider', {
        providerName: provider.name,
        version: versionNumber,
      });
      // eslint-disable-next-line no-await-in-loop
      await deleteArchitecturesForProvider(provider.name, versionNumber);
      // eslint-disable-next-line no-await-in-loop
      await ProviderService.deleteProvider(
        organization,
        currentBox.name,
        versionNumber,
        provider.name
      ).catch(e => {
        log.component.error('Error deleting provider', {
          providerName: provider.name,
          error: e.message,
        });
        throw e;
      });
    }
  };

  const deleteVersion = async versionNumber => {
    try {
      await deleteProvidersForVersion(versionNumber);
      await VersionDataService.deleteVersion(organization, currentBox.name, versionNumber);
      setMessage(t('version.deleted'));
      setMessageType('success');
      const remaining = versions.filter(version => version.versionNumber !== versionNumber);
      setVersions(remaining);
      setSelectedVersion(current =>
        current === versionNumber ? pickDefaultVersion(remaining) || '' : current
      );
    } catch (e) {
      log.component.error('Error deleting version', {
        versionNumber,
        error: e.message,
      });
      const errorMessage =
        e.response && e.response.data && e.response.data.message
          ? e.response.data.message
          : t('version.deleteError');
      setMessage(errorMessage);
      setMessageType('danger');
    }
  };

  const toggleWatch = async () => {
    const nextWatched = !watched;
    setWatched(nextWatched);
    setWatchBusy(true);
    try {
      if (nextWatched) {
        await BoxDataService.watch(organization, currentBox.name);
      } else {
        await BoxDataService.unwatch(organization, currentBox.name);
      }
    } catch (e) {
      log.api.error('Error toggling box watch', { error: e.message });
      setWatched(!nextWatched);
      setMessage(t('watch.error'));
      setMessageType('danger');
    } finally {
      setWatchBusy(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      const user = AuthService.getCurrentUser();
      if (user) {
        setCurrentUser(user);
      }

      if (name) {
        try {
          const boxResponse = await BoxDataService.get(organization, name);
          const boxData = boxResponse.data;
          setCurrentBox(boxData);
          setOriginalName(boxData.name);

          // Set document title
          document.title = boxData.name;

          if (boxData.organization) {
            setBoxOrganization(boxData.organization.name);
          }

          // Edit/delete/publish + version controls: owner or org admin/owner.
          setIsAuthorized(canManageBox(user, organization, boxData));

          if (user) {
            try {
              const watchesResponse = await BoxDataService.getUserWatches();
              setWatched((watchesResponse.data || []).some(entry => entry.boxId === boxData.id));
            } catch (watchError) {
              log.api.error('Error loading watched boxes', {
                error: watchError.message,
              });
            }
          }

          // Viewing is authorized by the backend (membership or public box),
          // so always fetch versions and let the API decide.
          const versionsResponse = await VersionDataService.getVersions(organization, name);
          setVersions(versionsResponse.data);
          setAllVersions(versionsResponse.data);
          setSelectedVersion(pickDefaultVersion(versionsResponse.data) || '');

          versionsResponse.data.forEach(version => {
            ProviderService.getProviders(organization, name, version.versionNumber)
              .then(providerResponse => {
                setProviders(prev => ({
                  ...prev,
                  [version.versionNumber]: providerResponse.data,
                }));
              })
              .catch(e => {
                log.api.error('Error fetching providers', {
                  versionNumber: version.versionNumber,
                  error: e.message,
                });
              });
          });
        } catch (e) {
          log.api.error('Error loading box data', {
            organization,
            boxName: name,
            error: e.message,
          });
          setMessage(t('box.notFound'));
          setMessageType('danger');
        }
      }
    };

    loadData();
  }, [organization, name, t]);

  useEffect(() => {
    let mounted = true;

    const loadHyperweaverConfig = async () => {
      try {
        const response = await fetch(`${window.location.origin}/api/config/hyperweaver`);
        if (response.ok) {
          const data = await response.json();
          const url = data?.hyperweaver?.url?.value;
          if (mounted && url) {
            setHyperweaverUrl(url.replace(/\/+$/, ''));
          }
        }
      } catch (error) {
        log.api.error('Error fetching hyperweaver config', {
          error: error.message,
        });
      }
    };

    loadHyperweaverConfig();

    return () => {
      mounted = false;
    };
  }, []);

  // Update title when box name changes (e.g., after edit)
  useEffect(() => {
    if (currentBox.name) {
      document.title = currentBox.name;
    }
  }, [currentBox.name]);

  const convertFieldValue = (fieldName, value) => {
    if (fieldName === 'isPublic') {
      return value === 'true' ? 1 : 0;
    }
    return value;
  };

  const handleInputChange = event => {
    const { name: fieldName, value } = event.target;
    setCurrentBox({
      ...currentBox,
      [fieldName]: convertFieldValue(fieldName, value),
    });
    setNewVersion({ ...newVersion, [fieldName]: value });

    if (fieldName === 'name') {
      const error = validateName(value);
      setValidationErrors({ ...validationErrors, name: error });
    }

    if (fieldName === 'versionNumber') {
      const error = validateName(value);
      setValidationErrors({ ...validationErrors, versionNumber: error });
    }
  };

  const updateRelease = status => {
    const data = {
      id: currentBox.id,
      name: currentBox.name,
      isPublic: currentBox.isPublic,
      description: currentBox.description,
      published: status,
    };

    BoxDataService.update(organization, currentBox.name, data).then(response => {
      setCurrentBox({ ...currentBox, published: status });
      log.api.debug('Box release status updated', {
        boxName: currentBox.name,
        published: status,
        response: response.data,
      });
    });
  };

  const updateBox = () => {
    if (currentBox.name !== originalName) {
      const boxExists = allVersions.some(v => v.name === currentBox.name);
      if (boxExists) {
        setMessage(t('box.exists'));
        setMessageType('danger');
        return;
      }
    }

    BoxDataService.update(organization, originalName, currentBox)
      .then(() => {
        setMessage(t('box.updated'));
        setMessageType('success');
        setEditMode(false);

        if (originalName !== currentBox.name) {
          navigate(`/${organization}/${currentBox.name}`);
        }
      })
      .catch(e => {
        log.api.error('Error updating box', {
          boxName: currentBox.name,
          error: e.message,
        });
        if (e.response && e.response.data && e.response.data.message) {
          setMessage(e.response.data.message);
        } else {
          setMessage(t('box.updateError'));
        }
        setMessageType('danger');
      });
  };

  const deleteBox = () => {
    BoxDataService.remove(organization, currentBox.name)
      .then(response => {
        log.api.debug('Box deleted successfully', {
          boxName: currentBox.name,
          response: response.data,
        });
        navigate(`/${organization}`);
      })
      .catch(e => {
        log.api.error('Error deleting box', {
          boxName: currentBox.name,
          error: e.message,
        });
        setMessage(t('box.deleteError'));
        setMessageType('danger');
      });
  };

  const cancelEdit = () => {
    setEditMode(false);
    setCurrentBox({ ...currentBox, name: originalName });
    setValidationErrors({});
  };

  const addVersion = event => {
    event.preventDefault();

    const versionNumberError =
      required(newVersion.versionNumber) || validateName(newVersion.versionNumber);
    if (versionNumberError) {
      setMessage(versionNumberError);
      setMessageType('danger');
      return;
    }

    const versionExists = versions.some(v => v.versionNumber === newVersion.versionNumber);
    if (versionExists) {
      setMessage(t('version.exists'));
      setMessageType('danger');
      return;
    }

    VersionDataService.createVersion(organization, currentBox.name, newVersion)
      .then(response => {
        setMessage(t('version.added'));
        setMessageType('success');
        setVersions([...versions, response.data]);
        setShowAddVersionForm(false);
        setNewVersion({ versionNumber: '', description: '' });
      })
      .catch(e => {
        if (e.response && e.response.data && e.response.data.message) {
          setMessage(e.response.data.message);
        } else {
          setMessage(t('version.addError'));
        }
        setMessageType('danger');
      });
  };

  const handleDeleteClick = () => {
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
  };

  const handleConfirmDelete = () => {
    deleteBox();
  };

  const handleVersionDeleteClick = versionNumber => {
    setVersionToDelete(versionNumber);
    setShowVersionModal(true);
  };

  const handleCloseVersionModal = () => {
    setShowVersionModal(false);
    setVersionToDelete(null);
  };

  const handleConfirmVersionDelete = () => {
    if (versionToDelete) {
      deleteVersion(versionToDelete);
      handleCloseVersionModal();
    }
  };

  const renderBackButton = () => (
    <Link className="btn btn-dark me-2" to={`/${boxOrganization}`}>
      {t('actions.backToFiles')}
    </Link>
  );

  const renderCicdBar = () => {
    if (!currentBox.githubRepo && !currentBox.cicdUrl) {
      return null;
    }

    return (
      <div className="d-flex align-items-center gap-2 mt-2 small">
        {currentBox.githubRepo && currentBox.workflowFile && (
          <a
            href={currentBox.cicdUrl || `https://github.com/${currentBox.githubRepo}/actions`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src={`https://github.com/${currentBox.githubRepo}/actions/workflows/${currentBox.workflowFile}/badge.svg`}
              alt={t('box.cicd.buildStatus')}
              className="badge-max-height"
            />
          </a>
        )}
        {currentBox.githubRepo && (
          <a
            href={`https://github.com/${currentBox.githubRepo}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {currentBox.githubRepo}
          </a>
        )}
        {!currentBox.githubRepo && currentBox.cicdUrl && (
          <a href={currentBox.cicdUrl} target="_blank" rel="noopener noreferrer">
            {t('box.cicd.viewPipeline')}
          </a>
        )}
      </div>
    );
  };

  const renderPublishButton = () => {
    if (currentBox.published) {
      return (
        <button className="btn btn-warning me-2" onClick={() => updateRelease(false)}>
          {t('box.unpublish')}
        </button>
      );
    }

    if (currentBox.id) {
      return (
        <button
          className="btn btn-outline-primary me-2"
          onClick={() => updateRelease(true)}
          disabled={!!validationErrors.name}
        >
          {t('box.publish')}
        </button>
      );
    }

    return null;
  };

  const renderEditForm = () => (
    <div className="edit-form">
      <form ref={form}>
        <div className="mb-1">
          <strong>{t('box.name')}:</strong>
        </div>
        <div className="form-group row align-items-center">
          <div className="col-auto pe-0">
            <input
              type="text"
              className="form-control"
              id="organization"
              name="organization"
              value={currentUser ? organization : ''}
              onChange={handleInputChange}
              disabled
            />
          </div>
          <div className="col-auto px-1">
            <span className="font-size-xl font-weight-bolder">/</span>
          </div>
          <div className="col-auto ps-0">
            <input
              type="text"
              className="form-control"
              id="name"
              name="name"
              value={currentBox.name}
              onChange={handleInputChange}
              required
            />
          </div>
        </div>
        {validationErrors.name && <div className="text-danger">{validationErrors.name}</div>}
        <small className="form-text text-muted">{t('box.shortDescription')}</small>
        <div className="form-group mt-2">
          <label htmlFor="boxStatus">
            <strong>{t('box.status')}: </strong>
          </label>
          {currentBox.published ? t('status.completed') : t('status.pending')}
        </div>
        <div className="form-group mt-2">
          <label htmlFor="boxVisibility">
            <strong>{t('box.visibility')}:</strong>
          </label>
          <div className="d-flex">
            <div className="form-check me-3">
              <input
                type="radio"
                className="form-check-input"
                id="visibilityPrivate"
                name="isPublic"
                value="false"
                checked={!currentBox.isPublic}
                onChange={handleInputChange}
              />
              <label className="form-check-label" htmlFor="visibilityPrivate">
                {t('box.organization.visibility.private')}
              </label>
            </div>
            <div className="form-check">
              <input
                type="radio"
                className="form-check-input"
                id="visibilityPublic"
                name="isPublic"
                value="true"
                checked={currentBox.isPublic}
                onChange={handleInputChange}
              />
              <label className="form-check-label" htmlFor="visibilityPublic">
                {t('box.organization.visibility.public')}
              </label>
            </div>
          </div>
          <small className="form-text text-muted">{t('box.visibilityHint')}</small>
        </div>
        <div className="form-group mt-2">
          <label className="mb-1" htmlFor="description">
            <strong>{t('box.description')}:</strong> {t('box.optional')}
          </label>
          <textarea
            className="form-control"
            id="description"
            required
            value={currentBox.description}
            onChange={handleInputChange}
            name="description"
            rows="4"
            placeholder={t('box.shortDescription')}
          />
        </div>
        <div className="form-group mt-3">
          <h5>
            <strong>{t('box.cicd.title')}</strong> {t('box.optional')}
          </h5>
          <small className="form-text text-muted mb-3">{t('box.cicd.connect')}</small>
          <div className="form-group mt-2">
            <label className="mb-1" htmlFor="githubRepo">
              <strong>{t('box.cicd.repository')}:</strong> {t('box.optional')}
            </label>
            <input
              type="text"
              className="form-control"
              id="githubRepo"
              name="githubRepo"
              value={currentBox.githubRepo || ''}
              onChange={handleInputChange}
              placeholder={t('box.cicd.repositoryPlaceholder')}
            />
            <small className="form-text text-muted">{t('box.cicd.repositoryHint')}</small>
          </div>
          <div className="form-group mt-2">
            <label className="mb-1" htmlFor="workflowFile">
              <strong>{t('box.cicd.workflow')}:</strong> {t('box.optional')}
            </label>
            <input
              type="text"
              className="form-control"
              id="workflowFile"
              name="workflowFile"
              value={currentBox.workflowFile || ''}
              onChange={handleInputChange}
              placeholder={t('box.cicd.workflowPlaceholder')}
            />
            <small className="form-text text-muted">{t('box.cicd.workflowHint')}</small>
          </div>
          <div className="form-group mt-2">
            <label className="mb-1" htmlFor="cicdUrl">
              <strong>{t('box.cicd.pipelineUrl')}:</strong> {t('box.optional')}
            </label>
            <input
              type="url"
              className="form-control"
              id="cicdUrl"
              name="cicdUrl"
              value={currentBox.cicdUrl || ''}
              onChange={handleInputChange}
              placeholder={t('box.cicd.pipelinePlaceholder')}
            />
            <small className="form-text text-muted">{t('box.cicd.pipelineHint')}</small>
          </div>
        </div>
      </form>
    </div>
  );

  const renderActionButtons = () => (
    <>
      {editMode ? (
        <>
          <button
            type="submit"
            className="btn btn-success me-2"
            onClick={updateBox}
            disabled={!!validationErrors.name}
          >
            {t('buttons.save')}
          </button>
          <button className="btn btn-secondary me-2" onClick={cancelEdit}>
            {t('buttons.cancel')}
          </button>
        </>
      ) : (
        <button className="btn btn-primary me-2" onClick={() => setEditMode(true)}>
          {t('buttons.edit')}
        </button>
      )}
      {currentBox.id && !editMode && (
        <button className="btn btn-danger me-2" onClick={handleDeleteClick}>
          {t('buttons.delete')}
        </button>
      )}
      <ConfirmationModal
        show={showModal}
        handleClose={handleCloseModal}
        handleConfirm={handleConfirmDelete}
      />
      {renderPublishButton()}
    </>
  );

  const heroActions = (
    <>
      {isAuthorized && renderActionButtons()}
      <DeployToHyperweaverButton
        user={currentUser}
        hyperweaverUrl={hyperweaverUrl}
        organization={organization}
        boxName={currentBox.name}
        selectedVersion={selectedVersion}
      />
      {renderBackButton()}
    </>
  );

  return (
    <div className="list row">
      {message && (
        <div className={`alert alert-${messageType}`} role="alert">
          {message}
        </div>
      )}
      {currentBox.id ? (
        <>
          {editMode ? (
            <div className="mb-4">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h4>{t('box.details')}</h4>
                <div>{heroActions}</div>
              </div>
              {renderEditForm()}
            </div>
          ) : (
            <BoxHero
              organization={organization}
              boxName={name}
              box={currentBox}
              watchControl={
                currentUser ? (
                  <WatchStarButton watched={watched} disabled={watchBusy} onToggle={toggleWatch} />
                ) : null
              }
              actions={heroActions}
              cicdBar={renderCicdBar()}
            />
          )}
          {versions.length > 0 && selectedVersion && (
            <UseThisBox
              organization={organization}
              boxName={currentBox.name}
              metadata={currentBox.metadata}
              versions={versions}
              selectedVersion={selectedVersion}
              onSelectVersion={setSelectedVersion}
            />
          )}
          {(currentBox.metadata || currentBox.readme) && (
            <div className="row g-3 mb-4 mx-0 px-0">
              {currentBox.metadata && (
                <div className="col-lg-5 col-xl-4">
                  <BoxFacts metadata={currentBox.metadata} />
                </div>
              )}
              {currentBox.readme && (
                <div className="col">
                  <BoxReadme readme={currentBox.readme} />
                </div>
              )}
            </div>
          )}
          <div className="list-table">
            <div className="d-flex justify-content-between align-items-center">
              <h4>{t('box.versionsTitle')}</h4>
              {isAuthorized && (
                <AddVersionControls
                  show={showAddVersionForm}
                  onToggleShow={() => setShowAddVersionForm(!showAddVersionForm)}
                  onSave={addVersion}
                  newVersion={newVersion}
                  validationErrors={validationErrors}
                />
              )}
            </div>
          </div>
          {showAddVersionForm && (
            <div>
              <form onSubmit={addVersion} ref={form}>
                <div className="form-group col-md-3">
                  <label htmlFor="versionNumber">{t('version.number')}</label>
                  <input
                    type="text"
                    className="form-control"
                    id="versionNumber"
                    name="versionNumber"
                    value={newVersion.versionNumber}
                    onChange={handleInputChange}
                    required
                  />
                  {validationErrors.versionNumber && (
                    <div className="text-danger">{validationErrors.versionNumber}</div>
                  )}
                </div>
                <div className="form-group">
                  <label htmlFor="versionDescription">{t('provider.description')}</label>
                  <textarea
                    className="form-control"
                    id="versionDescription"
                    name="description"
                    value={newVersion.description}
                    onChange={handleInputChange}
                    rows="3"
                  />
                </div>
              </form>
            </div>
          )}

          <Table striped className="table">
            <thead>
              <tr>
                <th>{t('version.number')}</th>
                <th>{t('version.details')}</th>
                <th>{t('version.providers', { version: '' }).replace(':', '')}</th>
                {isAuthorized && <th>{t('version.actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {sortVersionsNewestFirst(versions).map(version => (
                <tr key={version.id || version.versionNumber}>
                  <td>
                    <Link to={`/${organization}/${name}/${version.versionNumber}`}>
                      {version.versionNumber}
                    </Link>
                    {readDeprecated(version) && (
                      <span className="badge bg-danger ms-2">{t('version.deprecated')}</span>
                    )}
                  </td>
                  <td>{version.description}</td>
                  <td>
                    {providers[version.versionNumber] &&
                      providers[version.versionNumber].map(provider => (
                        <div key={provider.id || provider.name}>
                          <Link
                            to={`/${organization}/${name}/${version.versionNumber}/${provider.name}`}
                          >
                            {provider.name}
                          </Link>
                        </div>
                      ))}
                  </td>
                  {isAuthorized && (
                    <td>
                      <button
                        className="btn btn-danger"
                        onClick={() => handleVersionDeleteClick(version.versionNumber)}
                      >
                        {t('buttons.delete')}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
          <ConfirmationModal
            show={showVersionModal}
            handleClose={handleCloseVersionModal}
            handleConfirm={handleConfirmVersionDelete}
          />
        </>
      ) : (
        <div>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <button className="btn btn-dark me-2" onClick={() => navigate(`/`)}>
              {t('actions.backToFiles')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

Box.propTypes = {
  theme: PropTypes.string.isRequired,
};

export default Box;
