import PropTypes from 'prop-types';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FaChevronDown,
  FaChevronRight,
  FaDatabase,
  FaEnvelope,
  FaEnvelopeOpenText,
  FaGear,
  FaGears,
  FaShieldHalved,
} from 'react-icons/fa6';

import { log, useNotify } from '../chrome';

import { CONFIG_NAMES, processConfig } from './admin';
import ConfigField from './ConfigField';
import { responseMessage } from './itemShape';
import OidcProviders from './OidcProviders';

const SMTP_TEST_KEY = 'smtp-test';

const SECTION_ICONS = {
  authentication: FaShieldHalved,
  database: FaDatabase,
  mail: FaEnvelope,
  application: FaGears,
};

const SectionIcon = ({ sectionKey }) => {
  const Icon = SECTION_ICONS[sectionKey] || FaGear;
  return <Icon className="me-2" />;
};

SectionIcon.propTypes = {
  sectionKey: PropTypes.string.isRequired,
};

const wideField = field => field.type === 'textarea' || field.type === 'array';

const ConfigFields = ({ fields, values, onFieldChange, onUpload }) => (
  <div className="row">
    {fields.map(field => (
      <div key={field.path} className={wideField(field) ? 'col-12' : 'col-md-6'}>
        <ConfigField
          field={field}
          currentValue={values[field.path] !== undefined ? values[field.path] : field.value}
          onFieldChange={onFieldChange}
          onUpload={onUpload}
        />
      </div>
    ))}
  </div>
);

ConfigFields.propTypes = {
  fields: PropTypes.array.isRequired,
  values: PropTypes.object.isRequired,
  onFieldChange: PropTypes.func.isRequired,
  onUpload: PropTypes.func.isRequired,
};

const Subsection = ({ sectionKey, subsection, values, onFieldChange, onUpload }) => {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="card mb-4">
      <button
        type="button"
        className="card-header text-start w-100 border-0"
        onClick={() => setCollapsed(current => !current)}
        aria-expanded={!collapsed}
      >
        <h6 className="mb-0">
          {collapsed ? <FaChevronRight className="me-2" /> : <FaChevronDown className="me-2" />}
          <SectionIcon sectionKey={sectionKey} />
          {t(`configManager.subsections.${subsection.key}`)}
          <span className="badge bg-light text-dark ms-2">
            {t('configManager.settingsCount', { count: subsection.fields.length })}
          </span>
        </h6>
      </button>
      {!collapsed && (
        <div className="card-body">
          <ConfigFields
            fields={subsection.fields}
            values={values}
            onFieldChange={onFieldChange}
            onUpload={onUpload}
          />
        </div>
      )}
    </div>
  );
};

Subsection.propTypes = {
  sectionKey: PropTypes.string.isRequired,
  subsection: PropTypes.shape({
    key: PropTypes.string.isRequired,
    fields: PropTypes.array.isRequired,
  }).isRequired,
  values: PropTypes.object.isRequired,
  onFieldChange: PropTypes.func.isRequired,
  onUpload: PropTypes.func.isRequired,
};

const shouldShowSubsection = (subsection, subsectionName) => {
  if (subsectionName === 'oidcProviders') {
    return true;
  }
  if (subsectionName.toLowerCase().includes('oidc')) {
    return false;
  }
  return subsection.fields.length > 0;
};

const ConfigSection = ({ section, values, onFieldChange, onUpload, oidc }) => {
  const { t } = useTranslation();
  return (
    <div>
      {section.fields.length > 0 && (
        <div className="card mb-4">
          <div className="card-header">
            <h5 className="mb-0">
              <SectionIcon sectionKey={section.key} />
              {t(`configManager.sections.${section.key}`)}
              <span className="badge bg-light text-dark ms-2">
                {t('configManager.settingsCount', { count: section.fields.length })}
              </span>
            </h5>
          </div>
          <div className="card-body">
            <ConfigFields
              fields={section.fields}
              values={values}
              onFieldChange={onFieldChange}
              onUpload={onUpload}
            />
          </div>
        </div>
      )}
      {Object.entries(section.subsections || {}).map(([subsectionName, subsection]) => {
        if (!shouldShowSubsection(subsection, subsectionName)) {
          return null;
        }
        if (subsectionName === 'oidcProviders' && oidc) {
          return (
            <OidcProviders
              key={subsectionName}
              config={oidc.config}
              onConfigUpdate={oidc.onConfigUpdate}
            />
          );
        }
        return (
          <Subsection
            key={subsectionName}
            sectionKey={section.key}
            subsection={subsection}
            values={values}
            onFieldChange={onFieldChange}
            onUpload={onUpload}
          />
        );
      })}
    </div>
  );
};

ConfigSection.propTypes = {
  section: PropTypes.shape({
    key: PropTypes.string.isRequired,
    fields: PropTypes.array.isRequired,
    subsections: PropTypes.object,
  }).isRequired,
  values: PropTypes.object.isRequired,
  onFieldChange: PropTypes.func.isRequired,
  onUpload: PropTypes.func.isRequired,
  oidc: PropTypes.shape({
    config: PropTypes.object.isRequired,
    onConfigUpdate: PropTypes.func.isRequired,
  }),
};

const setValueAt = (tree, path, newValue) => {
  const keys = path.split('.');
  let current = tree;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (i === keys.length - 1) {
      if (current && typeof current[key] === 'object' && current[key] !== null) {
        current[key].value = newValue;
      }
    } else {
      current = current[key];
      if (current === undefined) {
        return;
      }
    }
  }
};

const SmtpTest = ({ onTest }) => {
  const { t } = useTranslation();
  const [testEmail, setTestEmail] = useState('');
  return (
    <div className="card mb-4">
      <div className="card-header">
        <h5 className="mb-0">
          <FaEnvelopeOpenText className="me-2" />
          {t('configManager.smtpTest.title')}
        </h5>
      </div>
      <div className="card-body">
        <div className="mb-3">
          <label htmlFor="testEmail" className="form-label">
            {t('configManager.smtpTest.recipient')}
          </label>
          <div className="input-group">
            <input
              type="email"
              className="form-control"
              id="testEmail"
              value={testEmail}
              onChange={e => setTestEmail(e.target.value)}
              placeholder={t('configManager.smtpTest.placeholder')}
            />
            <button
              className="btn btn-outline-primary"
              type="button"
              onClick={() => onTest(testEmail)}
            >
              {t('configManager.smtpTest.send')}
            </button>
          </div>
          <small className="form-text text-muted">{t('configManager.smtpTest.hint')}</small>
        </div>
      </div>
    </div>
  );
};

SmtpTest.propTypes = {
  onTest: PropTypes.func.isRequired,
};

/**
 * The Configuration tab of the admin page: one tab per configuration file
 * (app, auth, db, mail), its sections and foldable subsections of fields,
 * the OIDC providers block inside auth, update and restart, the SSL upload
 * on upload fields and the SMTP test on mail, every call through the app's
 * `config` adapter.
 */
const AdminConfig = ({ config: configApi }) => {
  const { t } = useTranslation();
  const notify = useNotify();
  const [selectedConfig, setSelectedConfig] = useState('app');
  const [config, setConfig] = useState({});
  const [sections, setSections] = useState({});
  const [values, setValues] = useState({});

  const fetchConfig = useCallback(
    configName => {
      configApi.get(configName).then(
        data => {
          setConfig(data);
          const { extractedValues, organizedSections } = processConfig(data, configName);
          setValues(extractedValues);
          setSections(organizedSections);
        },
        error => {
          log.api.error('Error fetching config', {
            configName,
            error: error.message,
          });
        }
      );
    },
    [configApi]
  );

  useEffect(() => {
    fetchConfig(selectedConfig);
  }, [selectedConfig, fetchConfig]);

  const handleFieldChange = (fieldPath, value) => {
    setValues(previous => ({ ...previous, [fieldPath]: value }));
  };

  const updateConfig = () => {
    const newConfig = JSON.parse(JSON.stringify(config));
    Object.entries(values).forEach(([path, value]) => {
      setValueAt(newConfig, path, value);
    });

    configApi.update(selectedConfig, newConfig).then(
      () => {
        notify('success', t('configManager.updateSuccess'));
        fetchConfig(selectedConfig);
      },
      error => {
        log.component.error('Error updating config', {
          configName: selectedConfig,
          error: error.message,
        });
        notify('danger', t('configManager.updateError'));
      }
    );
  };

  const handleConfigUpdate = async newConfig => {
    await configApi.update('auth', newConfig);
    setConfig(newConfig);
  };

  const handleTestSmtp = testEmail => {
    if (!testEmail) {
      notify('warning', t('configManager.smtpTest.emailRequired'));
      return;
    }

    notify('info', t('configManager.testingSmtp'), { key: SMTP_TEST_KEY });
    configApi
      .testSmtp(testEmail)
      .then(data => {
        notify('success', data.message || t('configManager.testSmtpSuccess'), {
          key: SMTP_TEST_KEY,
        });
      })
      .catch(error => {
        const resMessage = responseMessage(error, error.message || error.toString());
        notify('danger', `${t('configManager.testSmtpError')}: ${resMessage}`, {
          key: SMTP_TEST_KEY,
        });
      });
  };

  const handleFileUpload = async (file, targetPath) => {
    if (!file || !targetPath) {
      return;
    }

    try {
      await configApi.uploadSsl(file, targetPath);
      notify(
        'success',
        `${t('admin.messages.operationSuccessful')}. ${t('configManager.restartInitiated')}`
      );
    } catch (error) {
      log.component.error('Error uploading file', { error: error.message });
      notify('danger', t('admin.messages.uploadFailed'));
    }
  };

  const restart = () => {
    configApi
      .restart()
      .then(() => {
        notify('success', t('configManager.restartInitiated'));
      })
      .catch(() => {
        notify('danger', t('configManager.restartFailed'));
      });
  };

  const oidc = selectedConfig === 'auth' ? { config, onConfigUpdate: handleConfigUpdate } : null;

  return (
    <div className="mt-5">
      <ul className="nav nav-tabs d-flex">
        {CONFIG_NAMES.map(configName => (
          <li className="nav-item" key={configName}>
            <button
              type="button"
              className={`nav-link ${selectedConfig === configName ? 'active' : ''}`}
              onClick={() => setSelectedConfig(configName)}
            >
              {t(`configManager.tabs.${configName}`)}
            </button>
          </li>
        ))}
        <li className="nav-item ms-auto">
          <button type="button" className="nav-link cursor-pointer" onClick={updateConfig}>
            {t('configManager.buttons.update')}
          </button>
        </li>
        <li className="nav-item">
          <button type="button" className="nav-link" onClick={restart}>
            {t('configManager.buttons.restart')}
          </button>
        </li>
      </ul>
      <div className="config-container mt-3">
        {Object.entries(sections).map(([sectionName, section]) => (
          <ConfigSection
            key={sectionName}
            section={section}
            values={values}
            onFieldChange={handleFieldChange}
            onUpload={handleFileUpload}
            oidc={oidc}
          />
        ))}
        {selectedConfig === 'mail' && <SmtpTest onTest={handleTestSmtp} />}
      </div>
    </div>
  );
};

AdminConfig.propTypes = {
  config: PropTypes.shape({
    get: PropTypes.func.isRequired,
    update: PropTypes.func.isRequired,
    restart: PropTypes.func.isRequired,
    testSmtp: PropTypes.func.isRequired,
    uploadSsl: PropTypes.func.isRequired,
  }).isRequired,
};

export default AdminConfig;
