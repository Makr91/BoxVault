import PropTypes from "prop-types";
import { Fragment, useState, useEffect, useRef } from "react";
import { Table } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import Markdown from "react-markdown";
import { useParams, useNavigate, Link } from "react-router-dom";

import ArchitectureService from "../services/architecture.service";
import AuthService from "../services/auth.service";
import BoxDataService from "../services/box.service";
import FileService from "../services/file.service";
import ProviderService from "../services/provider.service";
import VersionDataService from "../services/version.service";
import { getDistroIconUrl, getOsDisplayName } from "../utils/DistroIcons";
import { log } from "../utils/Logger";
import { canManageBox } from "../utils/permissions";

import ConfirmationModal from "./confirmation.component";

// The backend field spelling for release-notes/deprecation is being settled
// by a parallel backend change; read both spellings defensively per the wire
// brief until it lands.
const readReleaseNotes = (version) =>
  version.releaseNotes ?? version.release_notes ?? null;

const readDeprecated = (version) => Boolean(version.deprecated);

const readDeprecationReason = (version) =>
  version.deprecationReason ?? version.deprecation_reason ?? null;

// Local size formatter (MB/GB), matching the per-component precedent set by
// provider.component.jsx / StorageInfo.component.jsx.
const formatFileSize = (bytes) => {
  const size = Number(bytes) || 0;
  const gib = size / 1024 ** 3;
  if (gib >= 1) {
    return `${gib.toFixed(2)} GB`;
  }
  return `${(size / 1024 ** 2).toFixed(2)} MB`;
};

// metadata.memory_mb display: GB when >= 1024, MB below.
const formatMemoryDisplay = (memoryMb) => {
  const mb = Number(memoryMb);
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }
  return `${mb} MB`;
};

// Hosts.yml memory format ("8G" style, like the core_provisioner examples).
const formatHostsMemory = (memoryMb) => {
  const mb = Number(memoryMb);
  return mb % 1024 === 0 ? `${mb / 1024}G` : `${mb}M`;
};

// One disk/cdrom entry as "name · size · controller" (present parts only).
const formatDiskEntry = (entry) => {
  if (typeof entry === "string") {
    return entry;
  }
  if (!entry || typeof entry !== "object") {
    return String(entry ?? "");
  }
  return [entry.name, entry.size, entry.controller].filter(Boolean).join(" · ");
};

const sortVersionsNewestFirst = (versionList) =>
  [...versionList].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

// Default picker choice: latest non-deprecated version, else latest.
const pickDefaultVersion = (versionList) => {
  if (!Array.isArray(versionList) || versionList.length === 0) {
    return null;
  }
  const sorted = sortVersionsNewestFirst(versionList);
  const active = sorted.find((version) => !readDeprecated(version));
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
    "---",
    "hosts:",
    "  -",
    "    settings:",
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
  return `${lines.join("\n")}\n`;
};

// Save a generated text file via a temporary object-URL anchor.
const downloadTextFile = (fileName, content) => {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
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
      (error) => {
        log.component.error("Could not copy text to clipboard", {
          error: error.message,
        });
      }
    );
  };

  return (
    <button
      type="button"
      className={`btn btn-sm ${copied ? "btn-success" : "btn-outline-light"}`}
      onClick={handleCopy}
    >
      {copied ? t("box.useThisBox.copied") : t("buttons.copy")}
    </button>
  );
};

CopyButton.propTypes = {
  text: PropTypes.string.isRequired,
};

// Dark code block with a copy action and an optional download action.
const CodeBlock = ({ code, downloadFileName }) => {
  const { t } = useTranslation();
  return (
    <div className="bg-dark text-light rounded p-3 mb-2">
      <div className="d-flex justify-content-end gap-2 mb-2">
        <CopyButton text={code} />
        {downloadFileName && (
          <button
            type="button"
            className="btn btn-sm btn-outline-light"
            onClick={() => downloadTextFile(downloadFileName, code)}
          >
            {t("buttons.download")}
          </button>
        )}
      </div>
      <pre className="text-light mb-0 overflow-auto">
        <code>{code}</code>
      </pre>
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
    <dt className="col-sm-3">{label}</dt>
    <dd className="col-sm-9 mb-1">{children}</dd>
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
      <dt className="col-sm-3">{t("box.facts.password")}</dt>
      <dd className="col-sm-9 mb-1">
        <code className="me-2">{show ? password : "••••••••"}</code>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={() => setShow(!show)}
        >
          {show ? t("box.facts.hide") : t("box.facts.show")}
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
      key: "os",
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
  if (typeof metadata.desktop === "boolean") {
    desktopLabel = t(
      metadata.desktop ? "box.facts.desktop" : "box.facts.server"
    );
  }
  const typeValue = [metadata.vm_type, desktopLabel]
    .filter(Boolean)
    .join(" · ");
  if (typeValue) {
    rows.push({ key: "type", content: typeValue });
  }
  if (metadata.username) {
    rows.push({ key: "username", content: <code>{metadata.username}</code> });
  }
  if (metadata.password) {
    rows.push({ key: "password", value: metadata.password });
  }
  if (metadata.communicator) {
    rows.push({ key: "communicator", content: metadata.communicator });
  }
  if (metadata.cpus) {
    rows.push({ key: "cpus", content: metadata.cpus });
  }
  if (metadata.memory_mb) {
    rows.push({
      key: "memory",
      content: formatMemoryDisplay(metadata.memory_mb),
    });
  }
  const disks = Array.isArray(metadata.disks) ? metadata.disks : [];
  const cdroms = Array.isArray(metadata.cdroms) ? metadata.cdroms : [];
  const diskEntries = [...disks, ...cdroms].map(formatDiskEntry);
  if (diskEntries.length > 0) {
    rows.push({
      key: "disks",
      content: diskEntries.map((entry) => <div key={entry}>{entry}</div>),
    });
  }
  if (Array.isArray(metadata.providers) && metadata.providers.length > 0) {
    rows.push({ key: "providers", content: metadata.providers.join(", ") });
  }
  if (metadata.built) {
    rows.push({ key: "built", content: metadata.built });
  }
  const driverValue =
    metadata.core_provisioner_version || metadata.driver_version;
  if (driverValue) {
    rows.push({ key: "driver", content: driverValue });
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
    <div className="card mb-4">
      <div className="card-header">
        <h5 className="mb-0">{t("box.facts.title")}</h5>
      </div>
      <div className="card-body">
        <dl className="mb-0">
          {rows.map((row) =>
            row.key === "password" ? (
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
  const versionPin = selectedVersion.replace(/^v/, "");
  const initCommand = `vagrant init ${boxTag} ${metadataUrl}\nvagrant up`;
  const pinnedVagrantfile = [
    `Vagrant.configure("2") do |config|`,
    `  config.vm.box = "${boxTag}"`,
    `  config.vm.box_url = "${metadataUrl}"`,
    `  config.vm.box_version = "${versionPin}"`,
    "end",
    "",
  ].join("\n");
  const hostsYml = buildStarterHostsYml({
    boxTag,
    origin,
    versionPin,
    metadata,
  });

  return (
    <div className="card mb-4">
      <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
        <h5 className="mb-0">{t("box.useThisBox.title")}</h5>
        <div className="d-flex align-items-center gap-2">
          <label className="mb-0" htmlFor="useThisBoxVersion">
            {t("box.useThisBox.version")}
          </label>
          <select
            id="useThisBoxVersion"
            className="form-select form-select-sm w-auto"
            value={selectedVersion}
            onChange={(e) => onSelectVersion(e.target.value)}
          >
            {versions.map((version) => (
              <option
                key={version.id || version.versionNumber}
                value={version.versionNumber}
              >
                {version.versionNumber}
                {readDeprecated(version) ? ` (${t("version.deprecated")})` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="card-body">
        <CodeBlock code={initCommand} />
        <details className="mb-2">
          <summary>{t("box.useThisBox.option2")}</summary>
          <div className="mt-2">
            <CodeBlock code={pinnedVagrantfile} />
          </div>
        </details>
        <details>
          <summary>{t("box.useThisBox.starterKit")}</summary>
          <div className="mt-2">
            <p className="mb-1">{t("box.useThisBox.starterStep1")}</p>
            <CodeBlock code={`vagrant box add ${boxTag} ${metadataUrl}`} />
            <p className="mb-1">
              <code>Vagrantfile</code>
            </p>
            <CodeBlock
              code={STARTER_VAGRANTFILE}
              downloadFileName="Vagrantfile"
            />
            <p className="mb-1">
              <code>Hosts.yml</code>
            </p>
            <CodeBlock code={hostsYml} downloadFileName="Hosts.yml" />
          </div>
        </details>
      </div>
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

// Per-provider download rows for the selected version, from the nested
// versions -> providers -> architectures -> files tree of box findone.
const ProviderDownloads = ({ organization, boxName, version }) => {
  const { t } = useTranslation();
  const providerList = version.providers || [];
  if (providerList.length === 0) {
    return null;
  }
  const { origin } = window.location;
  const versionPath = version.versionNumber.replace(/^v/, "");

  return (
    <div className="mb-3 w-100">
      <h5>{t("box.downloadsFor", { version: version.versionNumber })}</h5>
      {providerList.map((provider) => {
        const architectures = provider.architectures || [];
        const totalSize = architectures.reduce(
          (sum, arch) =>
            sum +
            (arch.files || []).reduce(
              (fileSum, file) => fileSum + Number(file.fileSize || 0),
              0
            ),
          0
        );
        return (
          <div
            key={provider.id || provider.name}
            className="d-flex align-items-center flex-wrap gap-2 border rounded p-2 mb-2"
          >
            <strong>{provider.name}</strong>
            <span className="text-muted">{formatFileSize(totalSize)}</span>
            {architectures.map((arch) => (
              <a
                key={arch.id || arch.name}
                className="btn btn-sm btn-outline-primary"
                href={`${origin}/${organization}/boxes/${boxName}/versions/${versionPath}/providers/${provider.name}/${arch.name}/vagrant.box`}
              >
                {t("buttons.download")} {arch.name}
              </a>
            ))}
          </div>
        );
      })}
    </div>
  );
};

ProviderDownloads.propTypes = {
  organization: PropTypes.string.isRequired,
  boxName: PropTypes.string.isRequired,
  version: PropTypes.object.isRequired,
};

const ReleaseNotesEditor = ({ initialNotes, onSave, onCancel }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(initialNotes);

  return (
    <div className="flex-grow-1">
      <textarea
        className="form-control mb-2"
        rows="4"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={t("version.releaseNotes")}
      />
      <button
        type="button"
        className="btn btn-sm btn-success me-2"
        onClick={() => onSave(draft)}
      >
        {t("buttons.save")}
      </button>
      <button
        type="button"
        className="btn btn-sm btn-secondary"
        onClick={onCancel}
      >
        {t("buttons.cancel")}
      </button>
    </div>
  );
};

ReleaseNotesEditor.propTypes = {
  initialNotes: PropTypes.string.isRequired,
  onSave: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

// Deprecate/undeprecate toggle; deprecating requires a reason.
const DeprecateControl = ({ deprecated, onToggle }) => {
  const { t } = useTranslation();
  const [askingReason, setAskingReason] = useState(false);
  const [reasonDraft, setReasonDraft] = useState("");

  if (deprecated) {
    return (
      <button
        type="button"
        className="btn btn-sm btn-outline-success"
        onClick={() => onToggle(false, null)}
      >
        {t("version.undeprecate")}
      </button>
    );
  }

  if (!askingReason) {
    return (
      <button
        type="button"
        className="btn btn-sm btn-outline-danger"
        onClick={() => setAskingReason(true)}
      >
        {t("version.deprecate")}
      </button>
    );
  }

  return (
    <div className="d-flex gap-2 align-items-start flex-wrap">
      <input
        type="text"
        className="form-control form-control-sm w-auto"
        value={reasonDraft}
        onChange={(e) => setReasonDraft(e.target.value)}
        placeholder={t("version.deprecationReason")}
      />
      <button
        type="button"
        className="btn btn-sm btn-danger"
        disabled={!reasonDraft.trim()}
        onClick={async () => {
          const ok = await onToggle(true, reasonDraft.trim());
          if (ok) {
            setAskingReason(false);
            setReasonDraft("");
          }
        }}
      >
        {t("version.deprecate")}
      </button>
      <button
        type="button"
        className="btn btn-sm btn-secondary"
        onClick={() => setAskingReason(false)}
      >
        {t("buttons.cancel")}
      </button>
    </div>
  );
};

DeprecateControl.propTypes = {
  deprecated: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
};

// Extra table row under each version: release notes (Markdown), deprecation
// notice, and manager controls (edit notes, deprecate/undeprecate).
const VersionExtrasRow = ({
  version,
  isAuthorized,
  columnCount,
  onSaveNotes,
  onToggleDeprecated,
}) => {
  const { t } = useTranslation();
  const [editingNotes, setEditingNotes] = useState(false);
  const notes = readReleaseNotes(version);
  const deprecated = readDeprecated(version);
  const reason = readDeprecationReason(version);

  if (!notes && !deprecated && !isAuthorized) {
    return null;
  }

  return (
    <tr>
      <td colSpan={columnCount}>
        {deprecated && (
          <div className="alert alert-warning py-1 px-2 mb-2">
            <strong>{t("version.deprecated")}</strong>
            {reason ? ` — ${reason}` : ""}
          </div>
        )}
        {notes && !editingNotes && (
          <div className="border rounded p-2 mb-2">
            <strong className="d-block mb-1">
              {t("version.releaseNotes")}
            </strong>
            <Markdown>{notes}</Markdown>
          </div>
        )}
        {isAuthorized && (
          <div className="d-flex flex-wrap gap-2 align-items-start">
            {editingNotes ? (
              <ReleaseNotesEditor
                initialNotes={notes || ""}
                onSave={async (draft) => {
                  const ok = await onSaveNotes(version.versionNumber, draft);
                  if (ok) {
                    setEditingNotes(false);
                  }
                }}
                onCancel={() => setEditingNotes(false)}
              />
            ) : (
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                onClick={() => setEditingNotes(true)}
              >
                {t("version.editReleaseNotes")}
              </button>
            )}
            <DeprecateControl
              deprecated={deprecated}
              onToggle={(nextDeprecated, nextReason) =>
                onToggleDeprecated(
                  version.versionNumber,
                  nextDeprecated,
                  nextReason
                )
              }
            />
          </div>
        )}
      </td>
    </tr>
  );
};

VersionExtrasRow.propTypes = {
  version: PropTypes.object.isRequired,
  isAuthorized: PropTypes.bool.isRequired,
  columnCount: PropTypes.number.isRequired,
  onSaveNotes: PropTypes.func.isRequired,
  onToggleDeprecated: PropTypes.func.isRequired,
};

// README rendered as Markdown; raw HTML stays escaped (react-markdown
// defaults) as the sanitization stance.
const BoxReadme = ({ readme }) => {
  const { t } = useTranslation();
  return (
    <div className="card mb-4 w-100">
      <div className="card-header">
        <h5 className="mb-0">{t("box.readmeTitle")}</h5>
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

// Red banner shown when the newest version of the box is deprecated.
const LatestDeprecatedBanner = ({ version }) => {
  const { t } = useTranslation();
  if (!version || !readDeprecated(version)) {
    return null;
  }
  const reason = readDeprecationReason(version);
  return (
    <div className="alert alert-danger" role="alert">
      {t("box.latestDeprecated", { version: version.versionNumber })}
      {reason ? ` ${reason}` : ""}
    </div>
  );
};

LatestDeprecatedBanner.propTypes = {
  version: PropTypes.object,
};

// Read-only details header: artwork, name, short description, status,
// visibility, description; CI/CD info arrives as children.
const BoxDetailsView = ({ box, artworkUrl, children }) => {
  const { t } = useTranslation();
  return (
    <div className="d-flex align-items-start gap-3 flex-wrap">
      {artworkUrl && (
        <img
          src={artworkUrl}
          alt=""
          className="rounded"
          style={{ width: 236, maxWidth: "100%" }}
        />
      )}
      <div className="flex-grow-1">
        <p>
          <strong>{t("box.name")}:</strong> {box.name}
        </p>
        {box.shortDescription && (
          <p className="text-muted">{box.shortDescription}</p>
        )}
        <p>
          <strong>{t("box.status")}:</strong>{" "}
          {box.published ? t("status.completed") : t("status.pending")}
        </p>
        <p>
          <strong>{t("box.visibility")}:</strong>{" "}
          {box.isPublic
            ? t("box.organization.visibility.public")
            : t("box.organization.visibility.private")}
        </p>
        <p>
          <strong>{t("box.description")}:</strong> {box.description}
        </p>
        {children}
      </div>
    </div>
  );
};

BoxDetailsView.propTypes = {
  box: PropTypes.object.isRequired,
  artworkUrl: PropTypes.string,
  children: PropTypes.node,
};

// Add-version header controls (toggle + save), shown to managers only.
const AddVersionControls = ({
  show,
  onToggleShow,
  onSave,
  newVersion,
  validationErrors,
}) => {
  const { t } = useTranslation();
  const saveDisabled =
    !newVersion.versionNumber || !!validationErrors.versionNumber;
  return (
    <div>
      <button
        className={`btn ${show ? "btn-secondary" : "btn-outline-success"} me-2`}
        onClick={onToggleShow}
      >
        {show ? t("buttons.cancel") : t("version.add")}
      </button>
      {show && (
        <button
          type="button"
          className="btn btn-success"
          onClick={onSave}
          disabled={saveDisabled}
        >
          {t("buttons.save")}
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
  const [originalName, setOriginalName] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [versionToDelete, setVersionToDelete] = useState(null);
  const navigate = useNavigate();
  log.component.debug("Box component theme", { theme });
  const initialBoxState = {
    id: null,
    name: "",
    description: "",
    published: false,
    isPublic: false,
    userId: null,
    organization: null,
    githubRepo: "",
    workflowFile: "",
    cicdUrl: "",
  };

  const [currentUser, setCurrentUser] = useState(null);
  const [currentBox, setCurrentBox] = useState(initialBoxState);
  const [boxOrganization, setBoxOrganization] = useState(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [showAddVersionForm, setShowAddVersionForm] = useState(false);
  const [newVersion, setNewVersion] = useState({
    versionNumber: "",
    description: "",
  });
  const [providers, setProviders] = useState({});
  const [allVersions, setAllVersions] = useState([]);
  const [validationErrors, setValidationErrors] = useState({});
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState("");

  const form = useRef();

  const required = (value) => (value ? undefined : t("validation.required"));

  const validCharsRegex = /^[0-9a-zA-Z-._]+$/;

  const validateName = (value) =>
    validCharsRegex.test(value) ? undefined : t("validation.invalidName");

  const deleteFilesForArchitecture = async (
    providerName,
    versionNumber,
    architectureName
  ) => {
    await FileService.delete(
      organization,
      currentBox.name,
      versionNumber,
      providerName,
      architectureName
    ).catch((e) => {
      log.file.error("Error deleting files for architecture", {
        architectureName,
        error: e.message,
      });
      throw e;
    });
  };

  const deleteArchitecturesForProvider = async (
    providerName,
    versionNumber
  ) => {
    const architectures = await ArchitectureService.getArchitectures(
      organization,
      currentBox.name,
      versionNumber,
      providerName
    );
    for (const architecture of architectures.data) {
      log.component.debug("Deleting architecture", {
        architectureName: architecture.name,
        provider: providerName,
      });
      // eslint-disable-next-line no-await-in-loop
      await deleteFilesForArchitecture(
        providerName,
        versionNumber,
        architecture.name
      );
      // eslint-disable-next-line no-await-in-loop
      await ArchitectureService.deleteArchitecture(
        organization,
        currentBox.name,
        versionNumber,
        providerName,
        architecture.name
      ).catch((e) => {
        log.component.error("Error deleting architecture", {
          architectureName: architecture.name,
          error: e.message,
        });
        throw e;
      });
    }
  };

  const deleteProvidersForVersion = async (versionNumber) => {
    const versionProviders = await ProviderService.getProviders(
      organization,
      currentBox.name,
      versionNumber
    );
    for (const provider of versionProviders.data) {
      log.component.debug("Deleting provider", {
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
      ).catch((e) => {
        log.component.error("Error deleting provider", {
          providerName: provider.name,
          error: e.message,
        });
        throw e;
      });
    }
  };

  const deleteVersion = async (versionNumber) => {
    try {
      await deleteProvidersForVersion(versionNumber);
      await VersionDataService.deleteVersion(
        organization,
        currentBox.name,
        versionNumber
      );
      setMessage(t("version.deleted"));
      setMessageType("success");
      const remaining = versions.filter(
        (version) => version.versionNumber !== versionNumber
      );
      setVersions(remaining);
      setSelectedVersion((current) =>
        current === versionNumber
          ? pickDefaultVersion(remaining) || ""
          : current
      );
    } catch (e) {
      log.component.error("Error deleting version", {
        versionNumber,
        error: e.message,
      });
      const errorMessage =
        e.response && e.response.data && e.response.data.message
          ? e.response.data.message
          : t("version.deleteError");
      setMessage(errorMessage);
      setMessageType("danger");
    }
  };

  const refreshVersions = async () => {
    const versionsResponse = await VersionDataService.getVersions(
      organization,
      currentBox.name
    );
    setVersions(versionsResponse.data);
    setAllVersions(versionsResponse.data);
    setSelectedVersion((current) =>
      versionsResponse.data.some((v) => v.versionNumber === current)
        ? current
        : pickDefaultVersion(versionsResponse.data) || ""
    );
  };

  // Release notes + deprecation go through the version update endpoint with
  // snake_case field names, then the list is refetched as the authority.
  const updateVersionFields = async (versionNumber, fields) => {
    try {
      await VersionDataService.updateVersion(
        organization,
        currentBox.name,
        versionNumber,
        fields
      );
      await refreshVersions();
      setMessage(t("version.updated"));
      setMessageType("success");
      return true;
    } catch (e) {
      log.api.error("Error updating version", {
        versionNumber,
        error: e.message,
      });
      setMessage(
        e.response && e.response.data && e.response.data.message
          ? e.response.data.message
          : t("version.updateError")
      );
      setMessageType("danger");
      return false;
    }
  };

  const saveReleaseNotes = (versionNumber, releaseNotes) =>
    updateVersionFields(versionNumber, { release_notes: releaseNotes });

  const toggleVersionDeprecated = (versionNumber, deprecated, reason) =>
    updateVersionFields(versionNumber, {
      deprecated,
      deprecation_reason: reason,
    });

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

          // Viewing is authorized by the backend (membership or public box),
          // so always fetch versions and let the API decide.
          const versionsResponse = await VersionDataService.getVersions(
            organization,
            name
          );
          setVersions(versionsResponse.data);
          setAllVersions(versionsResponse.data);
          setSelectedVersion(pickDefaultVersion(versionsResponse.data) || "");

          versionsResponse.data.forEach((version) => {
            ProviderService.getProviders(
              organization,
              name,
              version.versionNumber
            )
              .then((providerResponse) => {
                setProviders((prev) => ({
                  ...prev,
                  [version.versionNumber]: providerResponse.data,
                }));
              })
              .catch((e) => {
                log.api.error("Error fetching providers", {
                  versionNumber: version.versionNumber,
                  error: e.message,
                });
              });
          });
        } catch (e) {
          log.api.error("Error loading box data", {
            organization,
            boxName: name,
            error: e.message,
          });
          setMessage(t("box.notFound"));
          setMessageType("danger");
        }
      }
    };

    loadData();
  }, [organization, name, t]);

  // Update title when box name changes (e.g., after edit)
  useEffect(() => {
    if (currentBox.name) {
      document.title = currentBox.name;
    }
  }, [currentBox.name]);

  const convertFieldValue = (fieldName, value) => {
    if (fieldName === "isPublic") {
      return value === "true" ? 1 : 0;
    }
    return value;
  };

  const handleInputChange = (event) => {
    const { name: fieldName, value } = event.target;
    setCurrentBox({
      ...currentBox,
      [fieldName]: convertFieldValue(fieldName, value),
    });
    setNewVersion({ ...newVersion, [fieldName]: value });

    if (fieldName === "name") {
      const error = validateName(value);
      setValidationErrors({ ...validationErrors, name: error });
    }

    if (fieldName === "versionNumber") {
      const error = validateName(value);
      setValidationErrors({ ...validationErrors, versionNumber: error });
    }
  };

  const updateRelease = (status) => {
    const data = {
      id: currentBox.id,
      name: currentBox.name,
      isPublic: currentBox.isPublic,
      description: currentBox.description,
      published: status,
    };

    BoxDataService.update(organization, currentBox.name, data).then(
      (response) => {
        setCurrentBox({ ...currentBox, published: status });
        log.api.debug("Box release status updated", {
          boxName: currentBox.name,
          published: status,
          response: response.data,
        });
      }
    );
  };

  const updateBox = () => {
    if (currentBox.name !== originalName) {
      const boxExists = allVersions.some((v) => v.name === currentBox.name);
      if (boxExists) {
        setMessage(t("box.exists"));
        setMessageType("danger");
        return;
      }
    }

    BoxDataService.update(organization, originalName, currentBox)
      .then(() => {
        setMessage(t("box.updated"));
        setMessageType("success");
        setEditMode(false);

        if (originalName !== currentBox.name) {
          navigate(`/${organization}/${currentBox.name}`);
        }
      })
      .catch((e) => {
        log.api.error("Error updating box", {
          boxName: currentBox.name,
          error: e.message,
        });
        if (e.response && e.response.data && e.response.data.message) {
          setMessage(e.response.data.message);
        } else {
          setMessage(t("box.updateError"));
        }
        setMessageType("danger");
      });
  };

  const deleteBox = () => {
    BoxDataService.remove(organization, currentBox.name)
      .then((response) => {
        log.api.debug("Box deleted successfully", {
          boxName: currentBox.name,
          response: response.data,
        });
        navigate(`/${organization}`);
      })
      .catch((e) => {
        log.api.error("Error deleting box", {
          boxName: currentBox.name,
          error: e.message,
        });
        setMessage(t("box.deleteError"));
        setMessageType("danger");
      });
  };

  const cancelEdit = () => {
    setEditMode(false);
    setCurrentBox({ ...currentBox, name: originalName });
    setValidationErrors({});
  };

  const addVersion = (event) => {
    event.preventDefault();

    const versionNumberError =
      required(newVersion.versionNumber) ||
      validateName(newVersion.versionNumber);
    if (versionNumberError) {
      setMessage(versionNumberError);
      setMessageType("danger");
      return;
    }

    const versionExists = versions.some(
      (v) => v.versionNumber === newVersion.versionNumber
    );
    if (versionExists) {
      setMessage(t("version.exists"));
      setMessageType("danger");
      return;
    }

    VersionDataService.createVersion(organization, currentBox.name, newVersion)
      .then((response) => {
        setMessage(t("version.added"));
        setMessageType("success");
        setVersions([...versions, response.data]);
        setShowAddVersionForm(false);
        setNewVersion({ versionNumber: "", description: "" });
      })
      .catch((e) => {
        if (e.response && e.response.data && e.response.data.message) {
          setMessage(e.response.data.message);
        } else {
          setMessage(t("version.addError"));
        }
        setMessageType("danger");
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

  const handleVersionDeleteClick = (versionNumber) => {
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
      {t("actions.backToFiles")}
    </Link>
  );

  const renderCicdIntegration = () => {
    if (
      !currentBox.githubRepo &&
      !currentBox.workflowFile &&
      !currentBox.cicdUrl
    ) {
      return null;
    }

    return (
      <div className="mt-3">
        <h5>
          <strong>{t("box.cicd.title")}</strong>
        </h5>
        {currentBox.githubRepo && currentBox.workflowFile && (
          <div className="mb-2">
            <p>
              <strong>{t("box.cicd.buildStatus")}:</strong>
            </p>
            <a
              href={
                currentBox.cicdUrl ||
                `https://github.com/${currentBox.githubRepo}/actions`
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                src={`https://github.com/${currentBox.githubRepo}/actions/workflows/${currentBox.workflowFile}/badge.svg`}
                alt={t("box.cicd.buildStatus")}
                className="badge-max-height"
              />
            </a>
          </div>
        )}
        {currentBox.githubRepo && (
          <p>
            <strong>{t("box.cicd.repository")}:</strong>
            <a
              href={`https://github.com/${currentBox.githubRepo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ms-2"
            >
              {currentBox.githubRepo}
            </a>
          </p>
        )}
        {currentBox.workflowFile && (
          <p>
            <strong>{t("box.cicd.workflow")}:</strong> {currentBox.workflowFile}
          </p>
        )}
        {currentBox.cicdUrl && (
          <p>
            <strong>{t("box.cicd.pipeline")}:</strong>
            <a
              href={currentBox.cicdUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ms-2"
            >
              {t("box.cicd.viewPipeline")}
            </a>
          </p>
        )}
      </div>
    );
  };

  const renderPublishButton = () => {
    if (currentBox.published) {
      return (
        <button
          className="btn btn-warning me-2"
          onClick={() => updateRelease(false)}
        >
          {t("box.unpublish")}
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
          {t("box.publish")}
        </button>
      );
    }

    return null;
  };

  const renderEditForm = () => (
    <div className="edit-form">
      <form ref={form}>
        <div className="mb-1">
          <strong>{t("box.name")}:</strong>
        </div>
        <div className="form-group row align-items-center">
          <div className="col-auto pe-0">
            <input
              type="text"
              className="form-control"
              id="organization"
              name="organization"
              value={currentUser ? organization : ""}
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
        {validationErrors.name && (
          <div className="text-danger">{validationErrors.name}</div>
        )}
        <small className="form-text text-muted">
          {t("box.shortDescription")}
        </small>
        <div className="form-group mt-2">
          <label htmlFor="boxStatus">
            <strong>{t("box.status")}: </strong>
          </label>
          {currentBox.published ? t("status.completed") : t("status.pending")}
        </div>
        <div className="form-group mt-2">
          <label htmlFor="boxVisibility">
            <strong>{t("box.visibility")}:</strong>
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
                {t("box.organization.visibility.private")}
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
                {t("box.organization.visibility.public")}
              </label>
            </div>
          </div>
          <small className="form-text text-muted">
            {t("box.visibilityHint")}
          </small>
        </div>
        <div className="form-group mt-2">
          <label className="mb-1" htmlFor="description">
            <strong>{t("box.description")}:</strong> {t("box.optional")}
          </label>
          <textarea
            className="form-control"
            id="description"
            required
            value={currentBox.description}
            onChange={handleInputChange}
            name="description"
            rows="4"
            placeholder={t("box.shortDescription")}
          />
        </div>
        <div className="form-group mt-3">
          <h5>
            <strong>{t("box.cicd.title")}</strong> {t("box.optional")}
          </h5>
          <small className="form-text text-muted mb-3">
            {t("box.cicd.connect")}
          </small>
          <div className="form-group mt-2">
            <label className="mb-1" htmlFor="githubRepo">
              <strong>{t("box.cicd.repository")}:</strong> {t("box.optional")}
            </label>
            <input
              type="text"
              className="form-control"
              id="githubRepo"
              name="githubRepo"
              value={currentBox.githubRepo || ""}
              onChange={handleInputChange}
              placeholder={t("box.cicd.repositoryPlaceholder")}
            />
            <small className="form-text text-muted">
              {t("box.cicd.repositoryHint")}
            </small>
          </div>
          <div className="form-group mt-2">
            <label className="mb-1" htmlFor="workflowFile">
              <strong>{t("box.cicd.workflow")}:</strong> {t("box.optional")}
            </label>
            <input
              type="text"
              className="form-control"
              id="workflowFile"
              name="workflowFile"
              value={currentBox.workflowFile || ""}
              onChange={handleInputChange}
              placeholder={t("box.cicd.workflowPlaceholder")}
            />
            <small className="form-text text-muted">
              {t("box.cicd.workflowHint")}
            </small>
          </div>
          <div className="form-group mt-2">
            <label className="mb-1" htmlFor="cicdUrl">
              <strong>{t("box.cicd.pipelineUrl")}:</strong> {t("box.optional")}
            </label>
            <input
              type="url"
              className="form-control"
              id="cicdUrl"
              name="cicdUrl"
              value={currentBox.cicdUrl || ""}
              onChange={handleInputChange}
              placeholder={t("box.cicd.pipelinePlaceholder")}
            />
            <small className="form-text text-muted">
              {t("box.cicd.pipelineHint")}
            </small>
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
            {t("buttons.save")}
          </button>
          <button className="btn btn-secondary me-2" onClick={cancelEdit}>
            {t("buttons.cancel")}
          </button>
        </>
      ) : (
        <button
          className="btn btn-primary me-2"
          onClick={() => setEditMode(true)}
        >
          {t("buttons.edit")}
        </button>
      )}
      {currentBox.id && !editMode && (
        <button className="btn btn-danger me-2" onClick={handleDeleteClick}>
          {t("buttons.delete")}
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

  const [newestVersion] = sortVersionsNewestFirst(versions);
  const selectedVersionNode = Array.isArray(currentBox.versions)
    ? currentBox.versions.find(
        (version) => version.versionNumber === selectedVersion
      ) || null
    : null;

  return (
    <div className="list row">
      {message && (
        <div className={`alert alert-${messageType}`} role="alert">
          {message}
        </div>
      )}
      {currentBox.id ? (
        <>
          <LatestDeprecatedBanner version={newestVersion} />
          <div className="mb-4">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h4>{t("box.details")}</h4>
              <div>
                {isAuthorized && renderActionButtons()}
                {renderBackButton()}
              </div>
            </div>
            {editMode ? (
              renderEditForm()
            ) : (
              <BoxDetailsView
                box={currentBox}
                artworkUrl={
                  currentBox.artwork
                    ? `${window.location.origin}/api/organization/${organization}/box/${name}/artwork`
                    : null
                }
              >
                {renderCicdIntegration()}
              </BoxDetailsView>
            )}
          </div>
          {currentBox.metadata && <BoxFacts metadata={currentBox.metadata} />}
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
          {currentBox.readme && <BoxReadme readme={currentBox.readme} />}
          <div className="list-table">
            <div className="d-flex justify-content-between align-items-center">
              <h4>{t("box.versions", { name: currentBox.name })}</h4>
              {isAuthorized && (
                <AddVersionControls
                  show={showAddVersionForm}
                  onToggleShow={() =>
                    setShowAddVersionForm(!showAddVersionForm)
                  }
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
                  <label htmlFor="versionNumber">{t("version.number")}</label>
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
                    <div className="text-danger">
                      {validationErrors.versionNumber}
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label htmlFor="versionDescription">
                    {t("provider.description")}
                  </label>
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

          {selectedVersionNode && (
            <ProviderDownloads
              organization={organization}
              boxName={currentBox.name}
              version={selectedVersionNode}
            />
          )}

          <Table striped className="table">
            <thead>
              <tr>
                <th>{t("version.number")}</th>
                <th>{t("version.details")}</th>
                <th>
                  {t("version.providers", { version: "" }).replace(":", "")}
                </th>
                {isAuthorized && <th>{t("version.actions")}</th>}
              </tr>
            </thead>
            <tbody>
              {versions.map((version) => (
                <Fragment key={version.id || version.versionNumber}>
                  <tr>
                    <td>
                      <Link
                        to={`/${organization}/${name}/${version.versionNumber}`}
                      >
                        {version.versionNumber}
                      </Link>
                      {readDeprecated(version) && (
                        <span className="badge bg-danger ms-2">
                          {t("version.deprecated")}
                        </span>
                      )}
                    </td>
                    <td>{version.description}</td>
                    <td>
                      {providers[version.versionNumber] &&
                        providers[version.versionNumber].map((provider) => (
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
                          onClick={() =>
                            handleVersionDeleteClick(version.versionNumber)
                          }
                        >
                          {t("buttons.delete")}
                        </button>
                      </td>
                    )}
                  </tr>
                  <VersionExtrasRow
                    version={version}
                    isAuthorized={isAuthorized}
                    columnCount={isAuthorized ? 4 : 3}
                    onSaveNotes={saveReleaseNotes}
                    onToggleDeprecated={toggleVersionDeprecated}
                  />
                </Fragment>
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
              {t("actions.backToFiles")}
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
