import PropTypes from 'prop-types';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import {
  architectureShape,
  formatFileSize,
  itemShape,
  providerShape,
  responseMessage,
} from '../pages';
import ArchitectureService from '../services/architecture.service';
import FileService from '../services/file.service';
import ProviderService from '../services/provider.service';
import { log } from '../utils/Logger';
import { canManageBox } from '../utils/permissions';

import ConfirmationModal from './confirmation.component';

const NAME_RE = /^[0-9a-zA-Z-._]+$/;
const CHECKSUM_TYPES = ['NULL', 'MD5', 'SHA1', 'SHA256', 'SHA384', 'SHA512'];
const CHECKSUM_PATTERNS = {
  MD5: /^[a-fA-F0-9]{32}$/,
  SHA1: /^[a-fA-F0-9]{40}$/,
  SHA256: /^[a-fA-F0-9]{64}$/,
  SHA384: /^[a-fA-F0-9]{96}$/,
  SHA512: /^[a-fA-F0-9]{128}$/,
};

const slotShape = {
  item: itemShape.isRequired,
  version: PropTypes.string.isRequired,
  provider: providerShape.isRequired,
  ctx: PropTypes.shape({
    user: PropTypes.object,
    org: PropTypes.string.isRequired,
    reload: PropTypes.func.isRequired,
    notify: PropTypes.func.isRequired,
    setEditor: PropTypes.func,
    setForm: PropTypes.func,
  }).isRequired,
};

const ProviderEditForm = ({ draft, error, onChange }) => {
  const { t } = useTranslation();
  return (
    <form>
      <div className="form-group col-md-3">
        <label htmlFor="name">{t('provider.name')}</label>
        <input
          type="text"
          className="form-control"
          id="name"
          name="name"
          value={draft.name}
          onChange={onChange}
          required
        />
        {error ? <div className="text-danger">{error}</div> : null}
      </div>
      <div className="form-group">
        <label htmlFor="description">{t('provider.description')}</label>
        <textarea
          className="form-control"
          id="description"
          name="description"
          value={draft.description}
          onChange={onChange}
        />
      </div>
    </form>
  );
};

ProviderEditForm.propTypes = {
  draft: PropTypes.shape({
    name: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired,
  }).isRequired,
  error: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};

export const BoxProviderActions = ({ item, version, provider, ctx }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, org, reload, notify, setEditor } = ctx;
  const manage = canManageBox(user, org, item.extras.raw);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: provider.name,
    description: provider.description || '',
  });
  const [error, setError] = useState('');
  const [showDelete, setShowDelete] = useState(false);

  const onChange = useCallback(
    event => {
      const { name, value } = event.target;
      setDraft(current => ({ ...current, [name]: value }));
      if (name === 'name') {
        setError(value && NAME_RE.test(value) ? '' : t('validation.invalidName'));
      }
    },
    [t]
  );

  useEffect(() => {
    if (!editing) {
      return undefined;
    }
    setEditor(<ProviderEditForm draft={draft} error={error} onChange={onChange} />);
    return () => setEditor(null);
  }, [editing, draft, error, onChange, setEditor]);

  const save = async () => {
    if (error) {
      notify('danger', error);
      return;
    }
    const renamed = draft.name !== provider.name;
    if (renamed) {
      const exists = await ProviderService.getProvider(org, item.name, version, draft.name)
        .then(response => Boolean(response.data))
        .catch(() => false);
      if (exists) {
        notify('danger', t('provider.exists'));
        return;
      }
    }
    ProviderService.updateProvider(org, item.name, version, provider.name, draft)
      .then(() => {
        notify('success', t('provider.updated'));
        setEditing(false);
        if (renamed) {
          navigate(`/${org}/${item.name}/${version}/${draft.name}`);
        } else {
          reload();
        }
      })
      .catch(requestError => {
        log.api.error('Error updating provider', {
          providerName: draft.name,
          error: requestError.message,
        });
        notify('danger', responseMessage(requestError, t('provider.updateError')));
      });
  };

  const remove = () => {
    ProviderService.deleteProvider(org, item.name, version, provider.name)
      .then(() => navigate(`/${org}/${item.name}/${version}`))
      .catch(requestError => {
        log.api.error('Error deleting provider', {
          providerName: provider.name,
          error: requestError.message,
        });
        notify('danger', t('provider.deleteError'));
      });
  };

  const back = (
    <Link className="btn btn-dark me-2" to={`/${org}/${item.name}/${version}`}>
      {t('actions.back')}
    </Link>
  );

  if (!manage) {
    return back;
  }

  if (editing) {
    return (
      <>
        <button
          type="button"
          className="btn btn-success me-2"
          onClick={save}
          disabled={Boolean(error)}
        >
          {t('buttons.save')}
        </button>
        <button type="button" className="btn btn-secondary me-2" onClick={() => setEditing(false)}>
          {t('buttons.cancel')}
        </button>
        {back}
      </>
    );
  }

  return (
    <>
      <button type="button" className="btn btn-primary me-2" onClick={() => setEditing(true)}>
        {t('buttons.edit')}
      </button>
      <button type="button" className="btn btn-danger me-2" onClick={() => setShowDelete(true)}>
        {t('buttons.delete')}
      </button>
      {back}
      <ConfirmationModal
        show={showDelete}
        handleClose={() => setShowDelete(false)}
        handleConfirm={remove}
      />
    </>
  );
};

BoxProviderActions.propTypes = slotShape;

const UploadProgress = ({ file, progress }) => {
  const { t } = useTranslation();
  return (
    <div>
      <div className="progress progress-lg mb-2">
        <div
          className="progress-bar bg-success progress-bar-striped progress-bar-animated"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin="0"
          aria-valuemax="100"
          style={{ width: `${progress}%` }}
        >
          <span>{progress}%</span>
        </div>
      </div>
      <div className="text-muted upload-stats d-flex justify-content-between">
        <small>
          <strong>{t('architecture.fileSize')}:</strong> {formatFileSize(file.size)}
        </small>
        <small>
          <strong>{t('architecture.uploaded')}:</strong>{' '}
          {formatFileSize(Math.round((progress / 100) * file.size))} ({progress}%)
        </small>
        <small>
          <strong>{t('architecture.remaining')}:</strong>{' '}
          {formatFileSize(Math.round(((100 - progress) / 100) * file.size))}
        </small>
      </div>
    </div>
  );
};

UploadProgress.propTypes = {
  file: PropTypes.shape({ size: PropTypes.number.isRequired }).isRequired,
  progress: PropTypes.number.isRequired,
};

const AddArchitectureForm = ({ draft, errors, file, progress, onChange, onFile }) => {
  const { t } = useTranslation();
  return (
    <div className="add-architecture-form">
      <div className="form-group">
        <div className="form-check form-switch">
          <input
            className="form-check-input"
            type="checkbox"
            id="defaultBoxSwitch"
            name="defaultBox"
            checked={draft.defaultBox}
            onChange={onChange}
          />
          <label className="form-check-label" htmlFor="defaultBoxSwitch">
            {t('architecture.defaultBox')}
          </label>
        </div>
        <div className="mb-3">
          <label className="btn btn-outline-primary">
            <input
              type="file"
              onChange={onFile}
              className="d-none"
              accept=".box,application/octet-stream"
            />
            {t('architecture.chooseFile')}
          </label>
          {file ? (
            <div className="mt-2">
              <small className="text-muted">
                {t('architecture.selected', { name: file.name, size: formatFileSize(file.size) })}
              </small>
            </div>
          ) : null}
        </div>
        {file ? <UploadProgress file={file} progress={progress} /> : null}
        <div className="form-group col-md-3">
          <label htmlFor="architectureName">{t('architecture.name')}</label>
          <input
            type="text"
            className="form-control"
            id="architectureName"
            name="name"
            value={draft.name}
            onChange={onChange}
            required
          />
          {errors.name ? <div className="text-danger">{errors.name}</div> : null}
        </div>
        <div className="form-group col-md-3">
          <label htmlFor="checksumType">{t('architecture.checksumType')}</label>
          <select
            className="form-control"
            id="checksumType"
            name="checksumType"
            value={draft.checksumType}
            onChange={onChange}
          >
            {CHECKSUM_TYPES.map(type => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        {draft.checksumType !== 'NULL' ? (
          <div className="form-group">
            <label htmlFor="checksum">{t('architecture.checksum')}</label>
            <input
              type="text"
              className="form-control"
              id="checksum"
              name="checksum"
              value={draft.checksum}
              onChange={onChange}
            />
            {errors.checksum ? <div className="text-danger">{errors.checksum}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

AddArchitectureForm.propTypes = {
  draft: PropTypes.shape({
    name: PropTypes.string.isRequired,
    defaultBox: PropTypes.bool.isRequired,
    checksumType: PropTypes.string.isRequired,
    checksum: PropTypes.string.isRequired,
  }).isRequired,
  errors: PropTypes.shape({ name: PropTypes.string, checksum: PropTypes.string }).isRequired,
  file: PropTypes.object,
  progress: PropTypes.number.isRequired,
  onChange: PropTypes.func.isRequired,
  onFile: PropTypes.func.isRequired,
};

const EMPTY_ARCHITECTURE = { name: '', defaultBox: false, checksumType: 'NULL', checksum: '' };

const checksumError = (checksum, type, t) => {
  if (type === 'NULL') {
    return '';
  }
  if (!checksum) {
    return t('validation.required');
  }
  const pattern = CHECKSUM_PATTERNS[type];
  if (!pattern) {
    return t('validation.unsupportedChecksum');
  }
  return pattern.test(checksum) ? '' : t('validation.invalidChecksumFormat', { type });
};

const EMPTY_ERRORS = { name: '', checksum: '' };

const useArchitectureDraft = t => {
  const [state, setState] = useState({ draft: EMPTY_ARCHITECTURE, errors: EMPTY_ERRORS });

  const onChange = useCallback(
    event => {
      const { name, value, type, checked } = event.target;
      const next = type === 'checkbox' ? checked : value;
      setState(current => {
        const draft = { ...current.draft, [name]: next };
        return {
          draft,
          errors: {
            name: draft.name && NAME_RE.test(draft.name) ? '' : t('validation.invalidName'),
            checksum: checksumError(draft.checksum, draft.checksumType, t),
          },
        };
      });
    },
    [t]
  );

  const reset = () => setState({ draft: EMPTY_ARCHITECTURE, errors: EMPTY_ERRORS });

  return { draft: state.draft, errors: state.errors, onChange, reset };
};

export const BoxArchitecturesActions = ({ item, version, provider, ctx }) => {
  const { t } = useTranslation();
  const { user, org, reload, notify, setForm } = ctx;
  const [show, setShow] = useState(false);
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const { draft, errors, onChange, reset } = useArchitectureDraft(t);

  const onFile = useCallback(event => setFile(event.target.files[0] || null), []);

  useEffect(() => {
    if (!show) {
      return undefined;
    }
    setForm(
      <AddArchitectureForm
        draft={draft}
        errors={errors}
        file={file}
        progress={progress}
        onChange={onChange}
        onFile={onFile}
      />
    );
    return () => setForm(null);
  }, [show, draft, errors, file, progress, onChange, onFile, setForm]);

  if (!canManageBox(user, org, item.extras.raw)) {
    return null;
  }

  const onProgress = event => {
    if (event.status === 'assembling') {
      setProgress(100);
      notify('info', t('architecture.assembling'));
    } else if (event.status === 'complete') {
      setProgress(100);
      notify('success', t('architecture.uploadComplete'));
    } else if (event.progress !== undefined) {
      setProgress(event.progress);
    }
  };

  const save = async () => {
    if (!file) {
      notify('danger', t('architecture.selectFile'));
      return;
    }
    if (!draft.name) {
      notify('danger', t('architecture.enterName'));
      return;
    }
    notify('info', t('architecture.uploadStarting'));
    setProgress(0);
    try {
      await ArchitectureService.createArchitecture(org, item.name, version, provider.name, draft);
      const result = await FileService.upload(
        file,
        {
          organization: org,
          name: item.name,
          version,
          provider: provider.name,
          architecture: draft.name,
          checksum: draft.checksum,
          checksumType: draft.checksumType,
        },
        onProgress
      );
      if (result.details?.status === 'assembling') {
        notify('info', t('architecture.uploadAssembling'));
      }
      setShow(false);
      setFile(null);
      setProgress(0);
      reset();
      reload();
    } catch (error) {
      log.file.error('Upload failed', { error: error.message, stack: error.stack });
      notify('danger', responseMessage(error, t(error.message)));
    }
  };

  const disabled =
    Boolean(errors.name) || !file || (draft.checksumType !== 'NULL' && !draft.checksum);

  return (
    <div>
      <button
        type="button"
        className={`btn ${show ? 'btn-secondary' : 'btn-outline-success'} me-2`}
        onClick={() => setShow(current => !current)}
      >
        {show ? t('buttons.cancel') : t('architecture.add')}
      </button>
      {show ? (
        <button type="button" className="btn btn-success" onClick={save} disabled={disabled}>
          {t('buttons.save')}
        </button>
      ) : null}
    </div>
  );
};

BoxArchitecturesActions.propTypes = slotShape;

export const BoxArchitectureRowActions = ({ item, version, provider, architecture, ctx }) => {
  const { t } = useTranslation();
  const { user, org, reload, notify } = ctx;
  const [show, setShow] = useState(false);

  if (!canManageBox(user, org, item.extras.raw)) {
    return null;
  }

  const remove = () => {
    ArchitectureService.deleteArchitecture(
      org,
      item.name,
      version,
      provider.name,
      architecture.name
    )
      .then(() => {
        notify('success', t('architecture.deleted'));
        reload();
      })
      .catch(error => {
        log.component.error('Error deleting architecture', {
          architectureName: architecture.name,
          error: error.message,
        });
        notify('danger', responseMessage(error, t('architecture.deleteError')));
      });
  };

  return (
    <>
      <button type="button" className="btn btn-danger me-2" onClick={() => setShow(true)}>
        {t('buttons.delete')}
      </button>
      <ConfirmationModal show={show} handleClose={() => setShow(false)} handleConfirm={remove} />
    </>
  );
};

BoxArchitectureRowActions.propTypes = { ...slotShape, architecture: architectureShape.isRequired };
