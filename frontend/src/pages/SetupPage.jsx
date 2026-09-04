import PropTypes from 'prop-types';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FaCircleInfo, FaEye, FaEyeSlash } from 'react-icons/fa6';
import { useNavigate } from 'react-router-dom';

import { log, useNotify } from '../chrome';

import { CONFIG_NAMES, validateConfigValue } from './admin';

const SETUP_KEY = 'setup';
const REDIRECT_DELAY_MS = 5000;

/**
 * The app's side of the shared setup page: the setup token check, the
 * configuration read and write under that token, the setup status and
 * the SSL upload.
 */
export const setupShape = PropTypes.shape({
  status: PropTypes.func.isRequired,
  verifyToken: PropTypes.func.isRequired,
  configs: PropTypes.func.isRequired,
  update: PropTypes.func.isRequired,
  uploadSsl: PropTypes.func.isRequired,
});

const isField = value =>
  typeof value === 'object' && value !== null && 'type' in value && 'value' in value;

const validationError = (entry, value, t) => {
  if (entry.readonly) {
    return null;
  }
  if (value === null || value === undefined || value === '') {
    return t('setup.validation.valueRequired');
  }
  return validateConfigValue(entry.type, value, t);
};

const validateTree = (tree, t, errors = {}, path = []) => {
  Object.entries(tree).forEach(([key, value]) => {
    const currentPath = [...path, key];
    if (isField(value)) {
      errors[currentPath.join('.')] = validationError(value, value.value, t);
    } else if (typeof value === 'object' && value !== null) {
      validateTree(value, t, errors, currentPath);
    }
  });
  return errors;
};

const hasErrors = errors =>
  CONFIG_NAMES.some(configName =>
    Object.values(errors[configName] || {}).some(error => error !== null)
  );

const fillDialect = configs => {
  const { db } = configs;
  const dbType = db?.database_type?.value;
  if (dbType && db.sql?.dialect && !(db.sql.dialect.value || '').trim()) {
    db.sql.dialect.value = dbType;
  }
  return configs;
};

const FieldShell = ({ id, label, description, error, children }) => (
  <div className="form-group">
    <label htmlFor={id}>{label}</label>
    {children}
    <small className="form-text text-muted">{description}</small>
    {error && <div className="invalid-feedback">{error}</div>}
  </div>
);

FieldShell.propTypes = {
  id: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  description: PropTypes.string,
  error: PropTypes.string,
  children: PropTypes.node.isRequired,
};

const SetupField = ({ configName, path, entry, error, onChange, onUpload }) => {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const errorKey = path.join('.');
  const fieldId = `field-${errorKey}`;
  const label = path[path.length - 1];
  const inputValue = entry.value === null || entry.value === undefined ? '' : entry.value;
  const invalid = error ? 'is-invalid' : '';
  const change = e => onChange(configName, path, e.target.value);

  if (entry.type === 'select') {
    return (
      <FieldShell id={fieldId} label={label} description={entry.description} error={error}>
        <select
          id={fieldId}
          className={`form-control ${invalid}`}
          value={inputValue}
          onChange={change}
        >
          {(entry.options || []).map(option => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </FieldShell>
    );
  }

  if (entry.type === 'password') {
    return (
      <FieldShell id={fieldId} label={label} description={entry.description} error={error}>
        <div className="input-group">
          <input
            id={fieldId}
            type={showPassword ? 'text' : 'password'}
            className={`form-control ${invalid}`}
            value={inputValue}
            onChange={change}
          />
          <button
            className="btn btn-outline-secondary"
            type="button"
            onClick={() => setShowPassword(current => !current)}
          >
            {showPassword ? <FaEyeSlash /> : <FaEye />}
          </button>
        </div>
      </FieldShell>
    );
  }

  if (entry.upload) {
    return (
      <FieldShell id={fieldId} label={label} description={entry.description} error={error}>
        <div className="input-group">
          <input
            id={fieldId}
            type="text"
            className={`form-control ${invalid}`}
            value={inputValue}
            onChange={change}
          />
          <label className="btn btn-outline-secondary">
            {t('admin.buttons.upload')}
            <input
              type="file"
              hidden
              onChange={e => onUpload(configName, path, e.target.files[0])}
            />
          </label>
        </div>
      </FieldShell>
    );
  }

  return (
    <FieldShell id={fieldId} label={label} description={entry.description} error={error}>
      <input
        id={fieldId}
        type="text"
        className={`form-control ${invalid} ${entry.readonly ? 'readonly-input' : ''}`}
        value={inputValue}
        onChange={change}
        readOnly={entry.readonly}
      />
    </FieldShell>
  );
};

SetupField.propTypes = {
  configName: PropTypes.string.isRequired,
  path: PropTypes.arrayOf(PropTypes.string).isRequired,
  entry: PropTypes.object.isRequired,
  error: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  onUpload: PropTypes.func.isRequired,
};

const OidcInfo = () => {
  const { t } = useTranslation();
  return (
    <div className="col-md-12 mb-3">
      <div className="alert alert-info" role="status">
        <h6>
          <FaCircleInfo className="me-2" />
          {t('oidc.title')}
        </h6>
        <p className="mb-0">{t('setup.oidcNote')}</p>
      </div>
    </div>
  );
};

const SetupFields = ({ configName, tree, path, errors, databaseType, onChange, onUpload }) => {
  const { t } = useTranslation();
  return Object.entries(tree).map(([key, entry]) => {
    const currentPath = [...path, key];
    const errorKey = currentPath.join('.');

    if (configName === 'db' && key === 'sql' && databaseType === 'sqlite') {
      if (!entry.storage) {
        return null;
      }
      return (
        <FieldShell
          key="sql.storage"
          id="sql-storage"
          label={t('setup.sqlitePath')}
          description={entry.storage.description}
          error={errors['sql.storage']}
        >
          <input
            id="sql-storage"
            type="text"
            className={`form-control ${errors['sql.storage'] ? 'is-invalid' : ''}`}
            value={entry.storage.value || ''}
            onChange={e => onChange(configName, ['sql', 'storage'], e.target.value)}
          />
        </FieldShell>
      );
    }
    if (configName === 'db' && key === 'mysql_pool' && databaseType === 'sqlite') {
      return null;
    }
    if (key === 'oidc_providers' && entry.type === 'object') {
      return <OidcInfo key={errorKey} />;
    }
    if (typeof entry === 'object' && entry !== null && !isField(entry)) {
      return (
        <div key={errorKey} className="col-md-6 mb-3">
          <div className="card">
            <div className="card-header">
              <h5>{key}</h5>
            </div>
            <div className="card-body">
              <SetupFields
                configName={configName}
                tree={entry}
                path={currentPath}
                errors={errors}
                databaseType={databaseType}
                onChange={onChange}
                onUpload={onUpload}
              />
            </div>
          </div>
        </div>
      );
    }
    return (
      <SetupField
        key={errorKey}
        configName={configName}
        path={currentPath}
        entry={entry}
        error={errors[errorKey]}
        onChange={onChange}
        onUpload={onUpload}
      />
    );
  });
};

SetupFields.propTypes = {
  configName: PropTypes.string.isRequired,
  tree: PropTypes.object.isRequired,
  path: PropTypes.arrayOf(PropTypes.string).isRequired,
  errors: PropTypes.object.isRequired,
  databaseType: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  onUpload: PropTypes.func.isRequired,
};

/**
 * The first-run setup page of an app that configures itself in the
 * browser: the setup token gate, then one tab per configuration file with
 * every field validated by its type, the SQLite storage path in place of
 * the SQL block when SQLite is chosen, the SSL upload on upload fields,
 * and Submit all, which writes every file through the app's `setup`
 * adapter and sends the visitor to register.
 */
const SetupPage = ({ setup }) => {
  const { t } = useTranslation();
  const notify = useNotify();
  const navigate = useNavigate();
  const [configs, setConfigs] = useState({ db: {}, app: {}, auth: {}, mail: {} });
  const [setupComplete, setSetupComplete] = useState(false);
  const [setupToken, setSetupToken] = useState('');
  const [authorizedSetupToken, setAuthorizedSetupToken] = useState('');
  const [activeTab, setActiveTab] = useState('db');
  const [validationErrors, setValidationErrors] = useState({});

  useEffect(() => {
    document.title = t('setup.title');
  }, [t]);

  useEffect(() => {
    setup
      .status()
      .then(status => setSetupComplete(status.setupComplete))
      .catch(error => {
        log.api.error('Error checking setup status', { error: error.message });
      });
  }, [setup]);

  const isFormValid = !hasErrors(validationErrors);

  const adoptConfigs = data => {
    const next = fillDialect(data.configs);
    setConfigs(next);
    const errors = {};
    Object.keys(next).forEach(configName => {
      errors[configName] = validateTree(next[configName], t);
    });
    setValidationErrors(errors);
  };

  const handleVerifyToken = () => {
    setup
      .verifyToken(setupToken)
      .then(verified => {
        setAuthorizedSetupToken(verified.authorizedSetupToken);
        return setup.configs(verified.authorizedSetupToken).then(adoptConfigs);
      })
      .catch(error => {
        log.api.error('Error verifying setup token', { error: error.message });
        notify('danger', t('setup.invalidToken'));
      });
  };

  const validateField = (configName, path, value) => {
    const field = path.reduce((acc, key) => acc && acc[key], configs[configName]);
    const error =
      field && field.type
        ? validationError(field, value, t)
        : t('setup.validation.invalidFieldStructure');
    setValidationErrors(previous => ({
      ...previous,
      [configName]: { ...previous[configName], [path.join('.')]: error },
    }));
  };

  const handleConfigChange = (configName, path, value) => {
    setConfigs(previous => {
      const next = { ...previous };
      let current = next[configName];
      for (let i = 0; i < path.length - 1; i++) {
        if (current[path[i]] === null) {
          current[path[i]] = {};
        }
        current = current[path[i]];
      }
      const last = path[path.length - 1];
      if (current[last] === null) {
        current[last] = { value };
      } else {
        current[last].value = value;
      }
      if (configName === 'db' && path.join('.') === 'database_type' && next.db.sql?.dialect) {
        next.db.sql.dialect.value = value;
      }
      return next;
    });

    validateField(configName, path, value);
    if (configName === 'db' && path.join('.') === 'database_type') {
      validateField(configName, ['sql', 'dialect'], value);
    }
  };

  const handleFileUpload = (configName, path, file) => {
    if (!file) {
      return;
    }
    setup
      .uploadSsl(authorizedSetupToken, file)
      .then(({ path: storedPath }) => {
        handleConfigChange(configName, path, storedPath);
        notify('success', t('admin.messages.operationSuccessful'));
      })
      .catch(error => {
        log.api.error('Error uploading SSL file', { error: error.message });
        notify('danger', t('admin.messages.uploadFailed'));
      });
  };

  const handleSubmit = () => {
    if (!isFormValid) {
      notify('danger', t('setup.validation.fixErrors'));
      return;
    }
    setup
      .update(authorizedSetupToken, configs)
      .then(() => {
        notify('success', t('setup.updateSuccess'), { key: SETUP_KEY, sticky: true });
        setTimeout(() => {
          notify('', '', { key: SETUP_KEY });
          navigate('/register');
        }, REDIRECT_DELAY_MS);
      })
      .catch(error => {
        log.api.error('Error updating configuration', { error: error.message });
        notify('danger', t('setup.updateError'));
      });
  };

  const tabStatusClass = configName => {
    const errors = validationErrors[configName];
    if (!errors) {
      return '';
    }
    return Object.values(errors).some(error => error !== null) ? '' : 'text-success';
  };

  const renderBody = () => {
    if (setupComplete) {
      return (
        <div className="alert alert-success" role="status">
          {t('setup.alreadyComplete')}
        </div>
      );
    }
    if (!authorizedSetupToken) {
      return (
        <div className="card">
          <div className="card-body">
            <h5 className="card-title">{t('setup.enterToken')}</h5>
            <div className="input-group mb-3">
              <input
                type="text"
                className="form-control"
                placeholder={t('setup.tokenPlaceholder')}
                value={setupToken}
                onChange={e => setSetupToken(e.target.value)}
              />
              <button type="button" className="btn btn-primary" onClick={handleVerifyToken}>
                {t('setup.verifyToken')}
              </button>
            </div>
          </div>
        </div>
      );
    }
    const databaseType = configs.db.database_type?.value || 'mysql';
    return (
      <div>
        <ul className="nav nav-tabs mb-4 d-flex">
          {CONFIG_NAMES.map(configName => (
            <li className="nav-item" key={configName}>
              <button
                type="button"
                className={`nav-link ${activeTab === configName ? 'active' : ''} ${tabStatusClass(configName)}`}
                onClick={() => setActiveTab(configName)}
              >
                {t(`configManager.tabs.${configName}`)}
              </button>
            </li>
          ))}
          <li className="nav-item ms-auto">
            <button
              type="button"
              className={`nav-link ${isFormValid ? 'cursor-pointer' : 'disabled'}`}
              onClick={handleSubmit}
              disabled={!isFormValid}
            >
              {t('setup.submitAll')}
            </button>
          </li>
        </ul>

        <div className="tab-content">
          {CONFIG_NAMES.map(configName => (
            <div
              key={configName}
              className={`tab-pane ${activeTab === configName ? 'active' : ''}`}
            >
              <div className="row">
                <SetupFields
                  configName={configName}
                  tree={configs[configName]}
                  path={[]}
                  errors={validationErrors[configName] || {}}
                  databaseType={databaseType}
                  onChange={handleConfigChange}
                  onUpload={handleFileUpload}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="container mt-5">
      <h2 className="text-center mb-4">{t('setup.title')}</h2>
      {renderBody()}
    </div>
  );
};

SetupPage.propTypes = {
  setup: setupShape.isRequired,
};

export default SetupPage;
