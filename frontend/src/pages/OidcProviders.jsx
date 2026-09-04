import PropTypes from 'prop-types';
import { useState } from 'react';
import { Modal } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaCircleInfo, FaOpenid, FaPlus, FaShieldHalved, FaTrash } from 'react-icons/fa6';

import { useNotify } from '../chrome';

import ConfirmModal from './ConfirmModal';

const OIDC_PROVIDER_KEY = 'oidc-provider';
const REQUIRED_FIELDS = ['name', 'displayName', 'issuer', 'clientId', 'clientSecret'];
const EMPTY_FORM = {
  name: '',
  displayName: '',
  issuer: '',
  clientId: '',
  clientSecret: '',
  scope: 'openid profile email',
  responseType: 'code',
  iconUrl: '',
  enabled: true,
};

const providerConfigOf = form => ({
  enabled: {
    type: 'boolean',
    value: form.enabled,
    description: `Enable ${form.displayName} OIDC authentication`,
  },
  display_name: {
    type: 'string',
    value: form.displayName,
    description: 'Display name shown on login button',
  },
  issuer: {
    type: 'string',
    value: form.issuer,
    description: `${form.displayName} OIDC issuer URL`,
  },
  client_id: {
    type: 'string',
    value: form.clientId,
    description: `${form.displayName} OAuth Client ID`,
  },
  client_secret: {
    type: 'password',
    value: form.clientSecret,
    description: `${form.displayName} OAuth Client Secret`,
  },
  scope: {
    type: 'string',
    value: form.scope,
    description: 'OAuth scopes to request',
  },
  response_type: {
    type: 'select',
    value: form.responseType,
    options: ['code', 'id_token', 'code id_token'],
    description: 'OAuth 2.0 response type',
  },
  prompt: {
    type: 'string',
    value: '',
    description: 'Optional prompt parameter',
  },
  icon_url: {
    type: 'string',
    value: form.iconUrl,
    description: 'Icon shown on the login button',
  },
});

const formOf = (providerName, providerConfig) => ({
  name: providerName,
  displayName: providerConfig.display_name?.value || '',
  issuer: providerConfig.issuer?.value || '',
  clientId: providerConfig.client_id?.value || '',
  clientSecret: providerConfig.client_secret?.value || '',
  scope: providerConfig.scope?.value || 'openid profile email',
  responseType: providerConfig.response_type?.value || 'code',
  iconUrl: providerConfig.icon_url?.value || '',
  enabled: providerConfig.enabled?.value !== undefined ? providerConfig.enabled.value : false,
});

const ProviderCard = ({ providerName, providerConfig, onEdit }) => {
  const { t } = useTranslation();
  return (
    <div className="col-md-6 mb-3">
      <button
        type="button"
        className="card border-secondary w-100 text-start"
        onClick={() => onEdit(providerName, providerConfig)}
      >
        <div className="card-header">
          <h6 className="mb-0">
            <FaOpenid className="me-2" />
            {providerConfig.display_name?.value || providerName}
            {providerConfig.enabled?.value && (
              <span className="badge bg-success ms-2">{t('oidc.enabled')}</span>
            )}
          </h6>
        </div>
        <div className="card-body">
          <small className="text-muted">
            <strong>{t('oidc.issuer')}:</strong> {providerConfig.issuer?.value}
            <br />
            <strong>{t('oidc.clientId')}:</strong> {providerConfig.client_id?.value}
            <br />
            <strong>{t('oidc.scope')}:</strong> {providerConfig.scope?.value}
          </small>
        </div>
      </button>
    </div>
  );
};

ProviderCard.propTypes = {
  providerName: PropTypes.string.isRequired,
  providerConfig: PropTypes.object.isRequired,
  onEdit: PropTypes.func.isRequired,
};

const FormField = ({ id, label, required = false, hint, error, children }) => (
  <div className="form-group mb-3">
    <label htmlFor={id}>
      {label} {required ? <span className="text-danger">*</span> : null}
    </label>
    {children}
    {error ? <div className="text-danger small">{error}</div> : null}
    {hint ? <small className="form-text text-muted">{hint}</small> : null}
  </div>
);

FormField.propTypes = {
  id: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  required: PropTypes.bool,
  hint: PropTypes.string,
  error: PropTypes.string,
  children: PropTypes.node.isRequired,
};

const ProviderForm = ({ form, errors, editing, busy, onChange }) => {
  const { t } = useTranslation();
  const text = (field, type = 'text', extra = {}) => (
    <input
      type={type}
      className="form-control"
      id={field}
      placeholder={t(`oidc.form.${field}.placeholder`, { defaultValue: '' })}
      value={form[field]}
      onChange={e => onChange(field, e.target.value)}
      disabled={busy}
      {...extra}
    />
  );
  return (
    <div className="row">
      <div className="col-md-6">
        <FormField
          id="name"
          label={t('oidc.form.name.label')}
          required
          hint={t('oidc.form.name.hint')}
          error={errors.name}
        >
          <input
            type="text"
            className="form-control"
            id="name"
            placeholder={t('oidc.form.name.placeholder')}
            value={form.name}
            onChange={e => onChange('name', e.target.value.toLowerCase())}
            disabled={busy || editing}
            required
          />
        </FormField>
      </div>
      <div className="col-md-6">
        <FormField
          id="displayName"
          label={t('oidc.form.displayName.label')}
          required
          hint={t('oidc.form.displayName.hint')}
          error={errors.displayName}
        >
          {text('displayName', 'text', { required: true })}
        </FormField>
      </div>
      <div className="col-md-12">
        <FormField
          id="issuer"
          label={t('oidc.form.issuer.label')}
          required
          hint={t('oidc.form.issuer.hint')}
          error={errors.issuer}
        >
          {text('issuer', 'url', { required: true })}
        </FormField>
      </div>
      <div className="col-md-6">
        <FormField
          id="clientId"
          label={t('oidc.form.clientId.label')}
          required
          hint={t('oidc.form.clientId.hint')}
          error={errors.clientId}
        >
          {text('clientId', 'text', { required: true })}
        </FormField>
      </div>
      <div className="col-md-6">
        <FormField
          id="clientSecret"
          label={t('oidc.form.clientSecret.label')}
          required
          hint={t('oidc.form.clientSecret.hint')}
          error={errors.clientSecret}
        >
          {text('clientSecret', 'password', { required: true })}
        </FormField>
      </div>
      <div className="col-md-6">
        <FormField id="scope" label={t('oidc.form.scope.label')} hint={t('oidc.form.scope.hint')}>
          {text('scope')}
        </FormField>
      </div>
      <div className="col-md-6">
        <FormField
          id="responseType"
          label={t('oidc.form.responseType.label')}
          hint={t('oidc.form.responseType.hint')}
        >
          <select
            className="form-control"
            id="responseType"
            value={form.responseType}
            onChange={e => onChange('responseType', e.target.value)}
            disabled={busy}
          >
            <option value="code">{t('oidc.form.responseType.options.code')}</option>
            <option value="id_token">{t('oidc.form.responseType.options.id_token')}</option>
            <option value="code id_token">
              {t('oidc.form.responseType.options.code_id_token')}
            </option>
          </select>
        </FormField>
      </div>
      <div className="col-md-12">
        <FormField
          id="iconUrl"
          label={t('oidc.form.iconUrl.label')}
          hint={t('oidc.form.iconUrl.hint')}
        >
          {text('iconUrl', 'url')}
        </FormField>
      </div>
      <div className="col-md-12">
        <div className="form-check">
          <input
            type="checkbox"
            className="form-check-input"
            id="enabled"
            checked={form.enabled}
            onChange={e => onChange('enabled', e.target.checked)}
            disabled={busy}
          />
          <label className="form-check-label" htmlFor="enabled">
            {t('oidc.form.enabled.label')}
          </label>
        </div>
      </div>
    </div>
  );
};

ProviderForm.propTypes = {
  form: PropTypes.object.isRequired,
  errors: PropTypes.object.isRequired,
  editing: PropTypes.bool.isRequired,
  busy: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
};

/**
 * The OIDC providers block of the auth configuration: one card per
 * provider opening the add-or-edit dialog, the delete confirmation, every
 * change written back through `onConfigUpdate` with the whole auth tree.
 */
const OidcProviders = ({ config, onConfigUpdate }) => {
  const { t } = useTranslation();
  const notify = useNotify();
  const [formErrors, setFormErrors] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [editingProvider, setEditingProvider] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [providerToDelete, setProviderToDelete] = useState(null);

  const providers = config.auth?.oidc?.providers || {};

  const closeModal = () => {
    setShowModal(false);
    setEditingProvider(null);
  };

  const openAdd = () => {
    setEditingProvider(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setShowModal(true);
  };

  const openEdit = (providerName, providerConfig) => {
    setEditingProvider(providerName);
    setFormErrors({});
    setForm(formOf(providerName, providerConfig));
    setShowModal(true);
  };

  const onChange = (field, value) => {
    setForm(previous => ({ ...previous, [field]: value }));
    setFormErrors(previous => ({ ...previous, [field]: '' }));
  };

  const validate = () => {
    const errors = {};
    REQUIRED_FIELDS.forEach(field => {
      if (!form[field]) {
        errors[field] = t('oidc.errors.requiredFields');
      }
    });
    if (form.name && !/^[a-z0-9_]+$/i.test(form.name)) {
      errors.name = t('oidc.errors.invalidName');
    }
    if (form.name && providers[form.name] && !editingProvider) {
      errors.name = t('oidc.errors.providerExists', { name: form.name });
    }
    return errors;
  };

  const save = async e => {
    e.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    try {
      setBusy(true);
      notify('info', editingProvider ? t('oidc.messages.updating') : t('oidc.messages.adding'), {
        key: OIDC_PROVIDER_KEY,
      });
      const newConfig = { ...config };
      newConfig.auth ||= {};
      newConfig.auth.oidc ||= {};
      newConfig.auth.oidc.providers ||= {};
      newConfig.auth.oidc.providers[form.name] = providerConfigOf(form);
      await onConfigUpdate(newConfig);
      notify(
        'success',
        t('oidc.messages.success', {
          displayName: form.displayName,
          action: editingProvider ? t('oidc.actions.updated') : t('oidc.actions.added'),
        }),
        { key: OIDC_PROVIDER_KEY }
      );
      closeModal();
      setForm(EMPTY_FORM);
    } catch (error) {
      notify(
        'danger',
        t('oidc.errors.apiError', {
          action: editingProvider ? t('oidc.actions.updating') : t('oidc.actions.adding'),
          error: error.response?.data?.message || error.message,
        }),
        { key: OIDC_PROVIDER_KEY }
      );
    } finally {
      setBusy(false);
    }
  };

  const askDelete = () => {
    setProviderToDelete(editingProvider);
    closeModal();
    setShowDeleteModal(true);
  };

  const closeDelete = () => {
    setShowDeleteModal(false);
    setProviderToDelete(null);
  };

  const confirmDelete = async () => {
    if (!providerToDelete) {
      return;
    }
    try {
      notify('info', t('oidc.messages.deleting'), { key: OIDC_PROVIDER_KEY });
      const newConfig = { ...config };
      if (newConfig.auth?.oidc?.providers) {
        delete newConfig.auth.oidc.providers[providerToDelete];
      }
      await onConfigUpdate(newConfig);
      notify('success', t('oidc.messages.deleteSuccess', { providerName: providerToDelete }), {
        key: OIDC_PROVIDER_KEY,
      });
    } catch (error) {
      notify(
        'danger',
        t('oidc.errors.deleteError', {
          error: error.response?.data?.message || error.message,
        }),
        { key: OIDC_PROVIDER_KEY }
      );
    } finally {
      closeDelete();
    }
  };

  const submitLabel = () => {
    if (busy) {
      return editingProvider ? t('oidc.buttons.updating') : t('oidc.buttons.adding');
    }
    return editingProvider ? t('oidc.buttons.update') : t('oidc.buttons.add');
  };

  return (
    <>
      <div className="card mb-4">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h6 className="mb-0">
            <FaShieldHalved className="me-2" />
            {t('oidc.title')}
            <span className="badge bg-light text-dark ms-2">
              {t('oidc.providerCount', { count: Object.keys(providers).length })}
            </span>
          </h6>
          <button type="button" className="btn btn-primary btn-sm" onClick={openAdd}>
            <FaPlus className="me-1" />
            {t('oidc.buttons.add')}
          </button>
        </div>
        <div className="card-body">
          <p className="text-muted mb-3">{t('oidc.description')}</p>
          {Object.keys(providers).length > 0 ? (
            <div className="row">
              {Object.entries(providers).map(([providerName, providerConfig]) => (
                <ProviderCard
                  key={providerName}
                  providerName={providerName}
                  providerConfig={providerConfig}
                  onEdit={openEdit}
                />
              ))}
            </div>
          ) : (
            <div className="alert alert-info">
              <FaCircleInfo className="me-2" />
              {t('oidc.noProvidersConfigured')}
            </div>
          )}
        </div>
      </div>

      <Modal show={showModal} onHide={closeModal} size="lg">
        <form onSubmit={save}>
          <Modal.Header closeButton>
            <Modal.Title as="h5">
              <FaOpenid className="me-2" />
              {editingProvider ? t('oidc.modal.editTitle') : t('oidc.modal.addTitle')}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p className="text-muted mb-4">{t('oidc.modal.description')}</p>
            <ProviderForm
              form={form}
              errors={formErrors}
              editing={Boolean(editingProvider)}
              busy={busy}
              onChange={onChange}
            />
            <div className="alert alert-info mt-3" role="status">
              <h6>{t('oidc.instructions.title')}</h6>
              <ol className="mb-0">
                <li>{t('oidc.instructions.step1')}</li>
                <li>
                  {t('oidc.instructions.step2')}{' '}
                  <code>{`${window.location.origin}/api/auth/oidc/callback`}</code>{' '}
                  {t('oidc.instructions.step2_cont')}
                </li>
                <li>{t('oidc.instructions.step3')}</li>
                <li>{t('oidc.instructions.step4')}</li>
                <li>{t('oidc.instructions.step5')}</li>
              </ol>
            </div>
          </Modal.Body>
          <Modal.Footer>
            {editingProvider && (
              <button
                type="button"
                className="btn btn-danger me-auto"
                onClick={askDelete}
                disabled={busy}
              >
                <FaTrash className="me-1" />
                {t('oidc.buttons.delete')}
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={closeModal}
              disabled={busy}
            >
              {t('admin.buttons.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy && <span className="spinner-border spinner-border-sm me-2" />}
              {submitLabel()}
            </button>
          </Modal.Footer>
        </form>
      </Modal>

      <ConfirmModal
        show={showDeleteModal}
        handleClose={closeDelete}
        handleConfirm={confirmDelete}
        title={t('oidc.deleteModal.title')}
        message={t('oidc.deleteModal.message', { providerName: providerToDelete })}
      />
    </>
  );
};

OidcProviders.propTypes = {
  config: PropTypes.object.isRequired,
  onConfigUpdate: PropTypes.func.isRequired,
};

export default OidcProviders;
