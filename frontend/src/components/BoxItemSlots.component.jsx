import PropTypes from 'prop-types';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { deleteVersionCascade } from '../boxvaultAdapter';
import { itemShape, responseMessage, sortVersionsNewestFirst, versionShape } from '../pages';
import BoxService from '../services/box.service';
import VersionService from '../services/version.service';
import { log } from '../utils/Logger';
import { canManageBox } from '../utils/permissions';

import { DeployButton, deployableVersion } from './BoxDeploy.component';
import ConfirmationModal from './confirmation.component';

const NAME_RE = /^[0-9a-zA-Z-._]+$/;

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

const formatHostsMemory = memoryMb => {
  const mb = Number(memoryMb);
  return mb % 1024 === 0 ? `${mb / 1024}G` : `${mb}M`;
};

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
  const copy = () => {
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      error => {
        log.component.error('Could not copy text to clipboard', { error: error.message });
      }
    );
  };
  return (
    <button
      type="button"
      className={`btn btn-sm ${copied ? 'btn-success' : 'btn-outline-light'}`}
      onClick={copy}
    >
      {copied ? t('box.useThisBox.copied') : t('buttons.copy')}
    </button>
  );
};

CopyButton.propTypes = {
  text: PropTypes.string.isRequired,
};

const CodeBlock = ({ code, downloadFileName = '' }) => {
  const { t } = useTranslation();
  return (
    <div className="bg-dark text-light rounded p-3 mb-2 d-flex align-items-start gap-2">
      <pre className="text-light mb-0 overflow-auto flex-grow-1">
        <code>{code}</code>
      </pre>
      <div className="d-flex flex-column gap-2">
        <CopyButton text={code} />
        {downloadFileName ? (
          <button
            type="button"
            className="btn btn-sm btn-outline-light"
            onClick={() => downloadTextFile(downloadFileName, code)}
          >
            {t('buttons.download')}
          </button>
        ) : null}
      </div>
    </div>
  );
};

CodeBlock.propTypes = {
  code: PropTypes.string.isRequired,
  downloadFileName: PropTypes.string,
};

export const BoxItemExtras = ({ item, ctx }) => {
  const { t } = useTranslation();
  const { user, org } = ctx;
  const versions = sortVersionsNewestFirst(item.versions || []);
  const [selected, setSelected] = useState(() => deployableVersion(versions));

  if (versions.length === 0 || !selected) {
    return null;
  }

  const { origin } = window.location;
  const boxTag = `${org}/${item.name}`;
  const metadataUrl = `${origin}/${org}/boxes/${item.name}`;
  const versionPin = selected.replace(/^v/, '');
  const initCommand = `vagrant init ${boxTag} ${metadataUrl}\nvagrant up`;
  const pinnedVagrantfile = [
    `Vagrant.configure("2") do |config|`,
    `  config.vm.box = "${boxTag}"`,
    `  config.vm.box_url = "${metadataUrl}"`,
    `  config.vm.box_version = "${versionPin}"`,
    'end',
    '',
  ].join('\n');
  const hostsYml = buildStarterHostsYml({ boxTag, origin, versionPin, metadata: item.metadata });

  return (
    <div className="bg-dark text-light rounded p-3 mb-4">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
        <span className="text-uppercase small fw-semibold text-white-50">
          {t('box.useThisBox.title')}
        </span>
        <span className="d-flex align-items-center gap-3">
          <label
            className="mb-0 small text-white-50 d-flex align-items-center gap-2"
            htmlFor="useThisBoxVersion"
          >
            {t('box.useThisBox.version')}
            <select
              id="useThisBoxVersion"
              className="form-select form-select-sm w-auto"
              value={selected}
              onChange={event => setSelected(event.target.value)}
            >
              {versions.map(version => (
                <option key={version.version} value={version.version}>
                  {version.version}
                  {version.deprecated ? ` (${t('pages.status.deprecated')})` : ''}
                </option>
              ))}
            </select>
          </label>
          <DeployButton user={user} org={org} name={item.name} version={selected} size="btn-sm" />
        </span>
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

BoxItemExtras.propTypes = {
  item: itemShape.isRequired,
  ctx: PropTypes.shape({ user: PropTypes.object, org: PropTypes.string.isRequired }).isRequired,
};

export const BoxCicdBar = ({ item }) => {
  const { t } = useTranslation();
  const { repo, pipeline, badge } = item.links;
  if (!repo && !pipeline) {
    return null;
  }
  return (
    <div className="d-flex align-items-center gap-2 mt-2 small">
      {badge ? (
        <a href={pipeline || `${repo}/actions`} target="_blank" rel="noopener noreferrer">
          <img src={badge} alt={t('box.cicd.buildStatus')} className="badge-max-height" />
        </a>
      ) : null}
      {repo ? (
        <a href={repo} target="_blank" rel="noopener noreferrer">
          {repo.replace('https://github.com/', '')}
        </a>
      ) : null}
      {!repo && pipeline ? (
        <a href={pipeline} target="_blank" rel="noopener noreferrer">
          {t('box.cicd.viewPipeline')}
        </a>
      ) : null}
    </div>
  );
};

BoxCicdBar.propTypes = {
  item: itemShape.isRequired,
};

const EDIT_FIELDS = ['name', 'description', 'isPublic', 'githubRepo', 'workflowFile', 'cicdUrl'];

const draftFrom = box =>
  Object.fromEntries(
    EDIT_FIELDS.map(field => [field, box[field] ?? (field === 'isPublic' ? false : '')])
  );

const BoxEditForm = ({ org, published, draft, nameError, onChange }) => {
  const { t } = useTranslation();
  return (
    <div className="edit-form">
      <form>
        <div className="mb-1">
          <strong>{t('box.name')}:</strong>
        </div>
        <div className="form-group row align-items-center">
          <div className="col-auto pe-0">
            <input type="text" className="form-control" id="organization" value={org} disabled />
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
              value={draft.name}
              onChange={onChange}
              required
            />
          </div>
        </div>
        {nameError ? <div className="text-danger">{nameError}</div> : null}
        <small className="form-text text-muted">{t('box.shortDescription')}</small>
        <div className="form-group mt-2">
          <strong>{t('box.status')}: </strong>
          {published ? t('status.completed') : t('status.pending')}
        </div>
        <div className="form-group mt-2">
          <label htmlFor="visibilityPrivate">
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
                checked={!draft.isPublic}
                onChange={onChange}
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
                checked={Boolean(draft.isPublic)}
                onChange={onChange}
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
            name="description"
            value={draft.description}
            onChange={onChange}
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
              value={draft.githubRepo}
              onChange={onChange}
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
              value={draft.workflowFile}
              onChange={onChange}
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
              value={draft.cicdUrl}
              onChange={onChange}
              placeholder={t('box.cicd.pipelinePlaceholder')}
            />
            <small className="form-text text-muted">{t('box.cicd.pipelineHint')}</small>
          </div>
        </div>
      </form>
    </div>
  );
};

BoxEditForm.propTypes = {
  org: PropTypes.string.isRequired,
  published: PropTypes.bool.isRequired,
  draft: PropTypes.object.isRequired,
  nameError: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};

export const BoxItemActions = ({ item, ctx }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, org, reload, notify, setEditor } = ctx;
  const box = item.extras.raw;
  const manage = canManageBox(user, org, box);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => draftFrom(box));
  const [nameError, setNameError] = useState('');
  const [showDelete, setShowDelete] = useState(false);

  const onChange = useCallback(
    event => {
      const { name, value } = event.target;
      setDraft(current => ({ ...current, [name]: name === 'isPublic' ? value === 'true' : value }));
      if (name === 'name') {
        setNameError(NAME_RE.test(value) ? '' : t('validation.invalidName'));
      }
    },
    [t]
  );

  useEffect(() => {
    if (!editing) {
      return undefined;
    }
    setEditor(
      <BoxEditForm
        org={org}
        published={Boolean(box.published)}
        draft={draft}
        nameError={nameError}
        onChange={onChange}
      />
    );
    return () => setEditor(null);
  }, [editing, draft, nameError, onChange, org, box.published, setEditor]);

  const cancel = () => {
    setEditing(false);
    setDraft(draftFrom(box));
    setNameError('');
  };

  const save = () => {
    BoxService.update(org, box.name, { ...box, ...draft, isPublic: draft.isPublic ? 1 : 0 })
      .then(() => {
        notify('success', t('box.updated'));
        setEditing(false);
        if (draft.name !== box.name) {
          navigate(`/${org}/${draft.name}`);
        } else {
          reload();
        }
      })
      .catch(error => {
        log.api.error('Error updating box', { boxName: box.name, error: error.message });
        notify('danger', responseMessage(error, t('box.updateError')));
      });
  };

  const publish = published => {
    BoxService.update(org, box.name, {
      id: box.id,
      name: box.name,
      isPublic: box.isPublic,
      description: box.description,
      published,
    })
      .then(reload)
      .catch(error => {
        log.api.error('Error updating box release status', { error: error.message });
        notify('danger', responseMessage(error, t('box.updateError')));
      });
  };

  const remove = () => {
    BoxService.remove(org, box.name)
      .then(() => navigate(`/${org}`))
      .catch(error => {
        log.api.error('Error deleting box', { boxName: box.name, error: error.message });
        notify('danger', t('box.deleteError'));
      });
  };

  const editButtons = editing ? (
    <>
      <button
        type="button"
        className="btn btn-success me-2"
        onClick={save}
        disabled={Boolean(nameError)}
      >
        {t('buttons.save')}
      </button>
      <button type="button" className="btn btn-secondary me-2" onClick={cancel}>
        {t('buttons.cancel')}
      </button>
    </>
  ) : (
    <>
      <button type="button" className="btn btn-primary me-2" onClick={() => setEditing(true)}>
        {t('buttons.edit')}
      </button>
      <button type="button" className="btn btn-danger me-2" onClick={() => setShowDelete(true)}>
        {t('buttons.delete')}
      </button>
    </>
  );

  const publishButton = box.published ? (
    <button type="button" className="btn btn-warning me-2" onClick={() => publish(false)}>
      {t('box.unpublish')}
    </button>
  ) : (
    <button type="button" className="btn btn-outline-primary me-2" onClick={() => publish(true)}>
      {t('box.publish')}
    </button>
  );

  return (
    <>
      <DeployButton
        user={user}
        org={org}
        name={item.name}
        version={deployableVersion(item.versions)}
      />
      {manage ? editButtons : null}
      {manage ? publishButton : null}
      <Link className="btn btn-dark me-2" to={`/${org}`}>
        {t('actions.backToFiles')}
      </Link>
      <ConfirmationModal
        show={showDelete}
        handleClose={() => setShowDelete(false)}
        handleConfirm={remove}
      />
    </>
  );
};

BoxItemActions.propTypes = {
  item: itemShape.isRequired,
  ctx: PropTypes.shape({
    user: PropTypes.object,
    org: PropTypes.string.isRequired,
    reload: PropTypes.func.isRequired,
    notify: PropTypes.func.isRequired,
    setEditor: PropTypes.func.isRequired,
  }).isRequired,
};

const AddVersionForm = ({ draft, error, onChange }) => {
  const { t } = useTranslation();
  return (
    <form>
      <div className="form-group col-md-3">
        <label htmlFor="versionNumber">{t('version.number')}</label>
        <input
          type="text"
          className="form-control"
          id="versionNumber"
          name="versionNumber"
          value={draft.versionNumber}
          onChange={onChange}
          required
        />
        {error ? <div className="text-danger">{error}</div> : null}
      </div>
      <div className="form-group">
        <label htmlFor="versionDescription">{t('provider.description')}</label>
        <textarea
          className="form-control"
          id="versionDescription"
          name="description"
          value={draft.description}
          onChange={onChange}
          rows="3"
        />
      </div>
    </form>
  );
};

AddVersionForm.propTypes = {
  draft: PropTypes.shape({
    versionNumber: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired,
  }).isRequired,
  error: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};

const EMPTY_VERSION = { versionNumber: '', description: '' };

export const BoxVersionsActions = ({ item, ctx }) => {
  const { t } = useTranslation();
  const { user, org, reload, notify, setForm } = ctx;
  const manage = canManageBox(user, org, item.extras.raw);
  const [show, setShow] = useState(false);
  const [draft, setDraft] = useState(EMPTY_VERSION);
  const [error, setError] = useState('');

  const onChange = useCallback(
    event => {
      const { name, value } = event.target;
      setDraft(current => ({ ...current, [name]: value }));
      if (name === 'versionNumber') {
        setError(NAME_RE.test(value) ? '' : t('validation.invalidName'));
      }
    },
    [t]
  );

  useEffect(() => {
    if (!show) {
      return undefined;
    }
    setForm(<AddVersionForm draft={draft} error={error} onChange={onChange} />);
    return () => setForm(null);
  }, [show, draft, error, onChange, setForm]);

  if (!manage) {
    return null;
  }

  const save = () => {
    if (!draft.versionNumber || error) {
      notify('danger', error || t('validation.required'));
      return;
    }
    if ((item.versions || []).some(version => version.version === draft.versionNumber)) {
      notify('danger', t('version.exists'));
      return;
    }
    VersionService.createVersion(org, item.name, draft)
      .then(() => {
        notify('success', t('version.added'));
        setShow(false);
        setDraft(EMPTY_VERSION);
        reload();
      })
      .catch(requestError => {
        notify('danger', responseMessage(requestError, t('version.addError')));
      });
  };

  return (
    <div>
      <button
        type="button"
        className={`btn ${show ? 'btn-secondary' : 'btn-outline-success'} me-2`}
        onClick={() => setShow(current => !current)}
      >
        {show ? t('buttons.cancel') : t('version.add')}
      </button>
      {show ? (
        <button
          type="button"
          className="btn btn-success"
          onClick={save}
          disabled={!draft.versionNumber || Boolean(error)}
        >
          {t('buttons.save')}
        </button>
      ) : null}
    </div>
  );
};

BoxVersionsActions.propTypes = {
  item: itemShape.isRequired,
  ctx: PropTypes.shape({
    user: PropTypes.object,
    org: PropTypes.string.isRequired,
    reload: PropTypes.func.isRequired,
    notify: PropTypes.func.isRequired,
    setForm: PropTypes.func.isRequired,
  }).isRequired,
};

export const BoxVersionRowActions = ({ item, version, ctx }) => {
  const { t } = useTranslation();
  const { user, org, reload, notify } = ctx;
  const [show, setShow] = useState(false);

  if (!canManageBox(user, org, item.extras.raw)) {
    return null;
  }

  const remove = () => {
    deleteVersionCascade(org, item.name, version.version)
      .then(() => {
        notify('success', t('version.deleted'));
        reload();
      })
      .catch(error => {
        log.component.error('Error deleting version', {
          versionNumber: version.version,
          error: error.message,
        });
        notify('danger', responseMessage(error, t('version.deleteError')));
      });
  };

  return (
    <>
      <button type="button" className="btn btn-danger" onClick={() => setShow(true)}>
        {t('buttons.delete')}
      </button>
      <ConfirmationModal show={show} handleClose={() => setShow(false)} handleConfirm={remove} />
    </>
  );
};

BoxVersionRowActions.propTypes = {
  item: itemShape.isRequired,
  version: versionShape.isRequired,
  ctx: PropTypes.shape({
    user: PropTypes.object,
    org: PropTypes.string.isRequired,
    reload: PropTypes.func.isRequired,
    notify: PropTypes.func.isRequired,
  }).isRequired,
};
