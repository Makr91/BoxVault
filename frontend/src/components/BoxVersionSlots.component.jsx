import PropTypes from 'prop-types';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { deleteProviderCascade, deleteVersionCascade } from '../boxvaultAdapter';
import { itemShape, providerShape, responseMessage, versionShape } from '../pages';
import ProviderService from '../services/provider.service';
import VersionService from '../services/version.service';
import { log } from '../utils/Logger';
import { canManageBox } from '../utils/permissions';

import ConfirmationModal from './confirmation.component';

const NAME_RE = /^[0-9a-zA-Z-._]+$/;

const slotShape = {
  item: itemShape.isRequired,
  version: versionShape.isRequired,
  ctx: PropTypes.shape({
    user: PropTypes.object,
    org: PropTypes.string.isRequired,
    reload: PropTypes.func.isRequired,
    notify: PropTypes.func.isRequired,
    setEditor: PropTypes.func,
    setForm: PropTypes.func,
  }).isRequired,
};

const updateVersion = ({ org, item, version, fields, t, notify, reload }) =>
  VersionService.updateVersion(org, item.name, version.version, fields)
    .then(() => {
      notify('success', t('version.updated'));
      reload();
      return true;
    })
    .catch(error => {
      log.api.error('Error updating version', {
        versionNumber: version.version,
        error: error.message,
      });
      notify('danger', responseMessage(error, t('version.updateError')));
      return false;
    });

const VersionEditForm = ({ draft, error, onChange }) => {
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

VersionEditForm.propTypes = {
  draft: PropTypes.shape({
    versionNumber: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired,
  }).isRequired,
  error: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};

export const BoxVersionActions = ({ item, version, ctx }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, org, reload, notify, setEditor } = ctx;
  const manage = canManageBox(user, org, item.extras.raw);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    versionNumber: version.version,
    description: version.description || '',
  });
  const [error, setError] = useState('');
  const [showDelete, setShowDelete] = useState(false);

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
    if (!editing) {
      return undefined;
    }
    setEditor(<VersionEditForm draft={draft} error={error} onChange={onChange} />);
    return () => setEditor(null);
  }, [editing, draft, error, onChange, setEditor]);

  const save = () => {
    if (error) {
      notify('danger', error);
      return;
    }
    const renamed = draft.versionNumber !== version.version;
    if (renamed && (item.versions || []).some(entry => entry.version === draft.versionNumber)) {
      notify('danger', t('version.exists'));
      return;
    }
    VersionService.updateVersion(org, item.name, version.version, draft)
      .then(() => {
        notify('success', t('version.updated'));
        setEditing(false);
        if (renamed) {
          navigate(`/${org}/${item.name}/${draft.versionNumber}`);
        } else {
          reload();
        }
      })
      .catch(requestError => {
        notify('danger', responseMessage(requestError, t('version.updateError')));
      });
  };

  const remove = () => {
    deleteVersionCascade(org, item.name, version.version)
      .then(() => navigate(`/${org}/${item.name}`))
      .catch(requestError => {
        log.component.error('Error deleting version', {
          versionNumber: version.version,
          error: requestError.message,
        });
        notify('danger', responseMessage(requestError, t('version.deleteError')));
      });
  };

  const back = (
    <Link className="btn btn-dark me-2" to={`/${org}/${item.name}`}>
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

BoxVersionActions.propTypes = slotShape;

export const BoxVersionBannerActions = ({ item, version, ctx }) => {
  const { t } = useTranslation();
  const { user, org, reload, notify } = ctx;
  if (!canManageBox(user, org, item.extras.raw)) {
    return null;
  }
  return (
    <button
      type="button"
      className="btn btn-sm btn-outline-success"
      onClick={() =>
        updateVersion({
          org,
          item,
          version,
          fields: { deprecated: false, deprecation_reason: null },
          t,
          notify,
          reload,
        })
      }
    >
      {t('version.undeprecate')}
    </button>
  );
};

BoxVersionBannerActions.propTypes = slotShape;

const DeprecateButton = ({ onDeprecate }) => {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');

  if (!asking) {
    return (
      <button
        type="button"
        className="btn btn-sm btn-outline-danger"
        onClick={() => setAsking(true)}
      >
        {t('version.deprecate')}
      </button>
    );
  }

  return (
    <div className="d-flex gap-2 align-items-start flex-wrap">
      <input
        type="text"
        className="form-control form-control-sm w-auto"
        value={reason}
        onChange={event => setReason(event.target.value)}
        placeholder={t('version.deprecationReason')}
      />
      <button
        type="button"
        className="btn btn-sm btn-danger"
        disabled={!reason.trim()}
        onClick={async () => {
          const ok = await onDeprecate(reason.trim());
          if (ok) {
            setAsking(false);
            setReason('');
          }
        }}
      >
        {t('version.deprecate')}
      </button>
      <button type="button" className="btn btn-sm btn-secondary" onClick={() => setAsking(false)}>
        {t('buttons.cancel')}
      </button>
    </div>
  );
};

DeprecateButton.propTypes = {
  onDeprecate: PropTypes.func.isRequired,
};

export const BoxVersionNotesActions = ({ item, version, ctx }) => {
  const { t } = useTranslation();
  const { user, org, reload, notify } = ctx;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(version.releaseNotes || '');

  if (!canManageBox(user, org, item.extras.raw)) {
    return null;
  }

  const save = () =>
    updateVersion({
      org,
      item,
      version,
      fields: { release_notes: draft },
      t,
      notify,
      reload,
    }).then(ok => {
      if (ok) {
        setEditing(false);
      }
    });

  if (editing) {
    return (
      <div className="flex-grow-1">
        <textarea
          className="form-control mb-2"
          rows="4"
          value={draft}
          onChange={event => setDraft(event.target.value)}
          placeholder={t('version.releaseNotes')}
        />
        <button type="button" className="btn btn-sm btn-success me-2" onClick={save}>
          {t('buttons.save')}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={() => setEditing(false)}
        >
          {t('buttons.cancel')}
        </button>
      </div>
    );
  }

  return (
    <div className="d-flex flex-wrap gap-2 align-items-start">
      <button
        type="button"
        className="btn btn-sm btn-outline-primary"
        onClick={() => setEditing(true)}
      >
        {t('version.editReleaseNotes')}
      </button>
      {version.deprecated ? null : (
        <DeprecateButton
          onDeprecate={reason =>
            updateVersion({
              org,
              item,
              version,
              fields: { deprecated: true, deprecation_reason: reason },
              t,
              notify,
              reload,
            })
          }
        />
      )}
    </div>
  );
};

BoxVersionNotesActions.propTypes = slotShape;

const AddProviderForm = ({ draft, error, onChange }) => {
  const { t } = useTranslation();
  return (
    <form>
      <div className="add-provider-form">
        <div className="form-group col-md-3">
          <label htmlFor="providerName">{t('provider.name')}</label>
          <input
            type="text"
            className="form-control"
            id="providerName"
            name="name"
            value={draft.name}
            onChange={onChange}
            required
          />
          {error ? <div className="text-danger">{error}</div> : null}
        </div>
        <div className="form-group">
          <label htmlFor="providerDescription">{t('provider.description')}</label>
          <textarea
            className="form-control"
            id="providerDescription"
            name="description"
            value={draft.description}
            onChange={onChange}
          />
        </div>
      </div>
    </form>
  );
};

AddProviderForm.propTypes = {
  draft: PropTypes.shape({
    name: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired,
  }).isRequired,
  error: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};

const EMPTY_PROVIDER = { name: '', description: '' };

export const BoxProvidersActions = ({ item, version, ctx }) => {
  const { t } = useTranslation();
  const { user, org, reload, notify, setForm } = ctx;
  const [show, setShow] = useState(false);
  const [draft, setDraft] = useState(EMPTY_PROVIDER);
  const [error, setError] = useState('');

  const onChange = useCallback(
    event => {
      const { name, value } = event.target;
      setDraft(current => ({ ...current, [name]: value }));
      if (name === 'name') {
        setError(NAME_RE.test(value) ? '' : t('validation.invalidName'));
      }
    },
    [t]
  );

  useEffect(() => {
    if (!show) {
      return undefined;
    }
    setForm(<AddProviderForm draft={draft} error={error} onChange={onChange} />);
    return () => setForm(null);
  }, [show, draft, error, onChange, setForm]);

  if (!canManageBox(user, org, item.extras.raw)) {
    return null;
  }

  const save = () => {
    if (!draft.name || error) {
      notify('danger', t('validation.fixErrors'));
      return;
    }
    if ((version.providers || []).some(provider => provider.name === draft.name)) {
      notify('danger', t('provider.exists'));
      return;
    }
    ProviderService.createProvider(org, item.name, version.version, draft)
      .then(() => {
        notify('success', t('provider.created'));
        setShow(false);
        setDraft(EMPTY_PROVIDER);
        reload();
      })
      .catch(requestError => {
        notify('danger', responseMessage(requestError, t('provider.createError')));
      });
  };

  return (
    <div>
      <button
        type="button"
        className={`btn ${show ? 'btn-secondary' : 'btn-outline-success'} me-2`}
        onClick={() => setShow(current => !current)}
      >
        {show ? t('buttons.cancel') : t('provider.add')}
      </button>
      {show ? (
        <button
          type="button"
          className="btn btn-success me-2"
          onClick={save}
          disabled={!draft.name || Boolean(error)}
        >
          {t('buttons.save')}
        </button>
      ) : null}
    </div>
  );
};

BoxProvidersActions.propTypes = slotShape;

export const BoxProviderRowActions = ({ item, version, provider, ctx }) => {
  const { t } = useTranslation();
  const { user, org, reload, notify } = ctx;
  const [show, setShow] = useState(false);

  if (!canManageBox(user, org, item.extras.raw)) {
    return null;
  }

  const remove = () => {
    deleteProviderCascade(org, item.name, version.version, provider.name)
      .then(() => {
        notify('success', t('provider.deleted'));
        reload();
      })
      .catch(error => {
        log.component.error('Error deleting provider', {
          providerName: provider.name,
          error: error.message,
        });
        notify('danger', t('provider.deleteError'));
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

BoxProviderRowActions.propTypes = { ...slotShape, provider: providerShape.isRequired };
