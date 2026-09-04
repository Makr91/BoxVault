import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { log, useNotify } from '../chrome';
import { responseMessage } from '../pages';
import { api } from '../services/api';
import { processConfig } from '../utils/ConfigProcessorUtils';

import ConfigFieldRenderer from './ConfigFieldRenderer.component';
import OidcProviderManager from './OidcProviderManager.component';

const SMTP_TEST_KEY = 'smtp-test';

/**
 * ConfigurationManager - Manages system configuration
 */
const ConfigurationManager = () => {
  const { t } = useTranslation();
  const notify = useNotify();
  const [selectedConfig, setSelectedConfig] = useState('app');
  const [config, setConfig] = useState({});
  const [sections, setSections] = useState({});
  const [values, setValues] = useState({});
  const [collapsedSubsections, setCollapsedSubsections] = useState({});
  const [testEmail, setTestEmail] = useState('');

  const fetchConfig = useCallback(
    configName => {
      api.config.get(configName).then(
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
    [] // No dependencies needed
  );

  useEffect(() => {
    fetchConfig(selectedConfig);
  }, [selectedConfig, fetchConfig]);

  const handleFieldChange = (fieldPath, value) => {
    setValues(prev => ({
      ...prev,
      [fieldPath]: value,
    }));
  };

  const toggleSubsection = (sectionName, subsectionName) => {
    const key = `${sectionName}-${subsectionName}`;
    setCollapsedSubsections(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const isSubsectionCollapsed = (sectionName, subsectionName) => {
    const key = `${sectionName}-${subsectionName}`;
    return collapsedSubsections[key] || false;
  };

  const shouldShowSubsection = (subsection, subsectionName) => {
    if (subsectionName === 'oidcProviders') {
      return true;
    }
    // Hide individual OIDC provider subsections
    if (
      subsectionName &&
      subsectionName.toLowerCase().includes('oidc') &&
      subsectionName !== 'oidcProviders'
    ) {
      return false;
    }
    return subsection.fields.length > 0;
  };

  const updateConfig = () => {
    // Create a deep copy to avoid mutating the original state directly
    const newConfig = JSON.parse(JSON.stringify(config));

    // Helper function to recursively update the 'value' property in the config object
    const updateValueInObject = (obj, path, newValue) => {
      const keys = path.split('.');
      let current = obj;
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (i === keys.length - 1) {
          if (current && typeof current[key] === 'object' && current[key] !== null) {
            current[key].value = newValue;
          }
        } else {
          current = current[key];
          if (current === undefined) {
            // Path does not exist, stop.
            return;
          }
        }
      }
    };

    // Apply all the changed values from the `values` state to our new config object
    Object.entries(values).forEach(([path, value]) => {
      updateValueInObject(newConfig, path, value);
    });

    api.config.update(selectedConfig, newConfig).then(
      () => {
        notify('success', t('configManager.updateSuccess'));
        // Re-fetch config to ensure UI is in sync with the saved state
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
    await api.config.update('auth', newConfig);
    setConfig(newConfig);
  };

  const handleTestSmtp = () => {
    if (!testEmail) {
      notify('warning', t('configManager.smtpTest.emailRequired'));
      return;
    }

    notify('info', t('configManager.testingSmtp'), { key: SMTP_TEST_KEY });
    api.config
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
      await api.config.uploadSsl(file, targetPath);

      notify(
        'success',
        `${t('messages.operationSuccessful')}. ${t('configManager.restartInitiated')}`
      );
    } catch (error) {
      log.component.error('Error uploading file', { error: error.message });
      notify('danger', t('messages.uploadFailed'));
    }
  };

  const renderConfigSections = () => {
    if (selectedConfig === 'auth') {
      // Special rendering for auth config with OIDC provider management
      return (
        <>
          {Object.entries(sections).map(([sectionName, section]) => (
            <div key={sectionName}>
              {section.fields.length > 0 && (
                <div className="card mb-4">
                  <div className="card-header">
                    <h5 className="mb-0">
                      <i className={`${section.icon} me-2`} />{' '}
                      {t(`configManager.sections.${section.key}`)}
                      <span className="badge bg-light text-dark ms-2">
                        {t('configManager.settingsCount', {
                          count: section.fields.length,
                        })}
                      </span>
                    </h5>
                  </div>
                  <div className="card-body">
                    <div className="row">
                      {section.fields.map(field => {
                        const currentValue =
                          values[field.path] !== undefined ? values[field.path] : field.value;

                        if (field.upload) {
                          return (
                            <div key={field.path} className="col-md-6">
                              <div className="mb-3">
                                <label className="form-label">
                                  {field.label}
                                  {field.required && <span className="text-danger">*</span>}
                                </label>
                                <div className="input-group">
                                  <input
                                    type="text"
                                    className="form-control"
                                    value={currentValue}
                                    onChange={e => handleFieldChange(field.path, e.target.value)}
                                    placeholder={field.placeholder}
                                  />
                                  <label className="btn btn-outline-secondary">
                                    {t('buttons.upload')}
                                    <input
                                      type="file"
                                      hidden
                                      onChange={e =>
                                        handleFileUpload(e.target.files[0], currentValue)
                                      }
                                    />
                                  </label>
                                </div>
                                <small className="form-text text-muted">{field.description}</small>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={field.path}
                            className={
                              field.type === 'textarea' || field.type === 'array'
                                ? 'col-12'
                                : 'col-md-6'
                            }
                          >
                            <ConfigFieldRenderer
                              field={field}
                              currentValue={currentValue}
                              onFieldChange={handleFieldChange}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Render subsections */}
              {Object.entries(section.subsections || {}).map(([subsectionName, subsection]) => {
                if (!shouldShowSubsection(subsection, subsectionName)) {
                  return null;
                }

                if (subsectionName === 'oidcProviders') {
                  return (
                    <OidcProviderManager
                      key={subsectionName}
                      config={config}
                      onConfigUpdate={handleConfigUpdate}
                    />
                  );
                }

                const isCollapsed = isSubsectionCollapsed(sectionName, subsectionName);

                return (
                  <div key={subsectionName} className="card mb-4">
                    <div
                      className="card-header cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleSubsection(sectionName, subsectionName)}
                      onKeyPress={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          toggleSubsection(sectionName, subsectionName);
                        }
                      }}
                    >
                      <h6 className="mb-0">
                        <i
                          className={`fas ${isCollapsed ? 'fa-chevron-right' : 'fa-chevron-down'} me-2`}
                        />
                        <i className={`${section.icon} me-2`} />{' '}
                        {t(`configManager.subsections.${subsection.key}`)}
                        <span className="badge bg-light text-dark ms-2">
                          {t('configManager.settingsCount', {
                            count: subsection.fields.length,
                          })}
                        </span>
                      </h6>
                    </div>
                    {!isCollapsed && (
                      <div className="card-body">
                        <div className="row">
                          {subsection.fields.map(field => {
                            const currentValue =
                              values[field.path] !== undefined ? values[field.path] : field.value;

                            if (field.upload) {
                              return (
                                <div key={field.path} className="col-md-6">
                                  <div className="mb-3">
                                    <label className="form-label">
                                      {field.label}
                                      {field.required && <span className="text-danger">*</span>}
                                    </label>
                                    <div className="input-group">
                                      <input
                                        type="text"
                                        className="form-control"
                                        value={currentValue}
                                        onChange={e =>
                                          handleFieldChange(field.path, e.target.value)
                                        }
                                        placeholder={field.placeholder}
                                      />
                                      <label className="btn btn-outline-secondary">
                                        {t('buttons.upload')}
                                        <input
                                          type="file"
                                          hidden
                                          onChange={e =>
                                            handleFileUpload(e.target.files[0], currentValue)
                                          }
                                        />
                                      </label>
                                    </div>
                                    <small className="form-text text-muted">
                                      {field.description}
                                    </small>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={field.path}
                                className={
                                  field.type === 'textarea' || field.type === 'array'
                                    ? 'col-12'
                                    : 'col-md-6'
                                }
                              >
                                <ConfigFieldRenderer
                                  field={field}
                                  currentValue={currentValue}
                                  onFieldChange={handleFieldChange}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </>
      );
    }

    // Standard rendering for non-auth configs
    return Object.entries(sections).map(([sectionName, section]) => (
      <div key={sectionName}>
        {section.fields.length > 0 && (
          <div className="card mb-4">
            <div className="card-header">
              <h5 className="mb-0">
                <i className={`${section.icon} me-2`} />{' '}
                {t(`configManager.sections.${section.key}`)}
                <span className="badge bg-light text-dark ms-2">
                  {t('configManager.settingsCount', {
                    count: section.fields.length,
                  })}
                </span>
              </h5>
            </div>
            <div className="card-body">
              <div className="row">
                {section.fields.map(field => {
                  const currentValue =
                    values[field.path] !== undefined ? values[field.path] : field.value;

                  if (field.upload) {
                    return (
                      <div key={field.path} className="col-md-6">
                        <div className="mb-3">
                          <label className="form-label">
                            {field.label}
                            {field.required && <span className="text-danger">*</span>}
                          </label>
                          <div className="input-group">
                            <input
                              type="text"
                              className="form-control"
                              value={currentValue}
                              onChange={e => handleFieldChange(field.path, e.target.value)}
                              placeholder={field.placeholder}
                            />
                            <label className="btn btn-outline-secondary">
                              {t('buttons.upload')}
                              <input
                                type="file"
                                hidden
                                onChange={e => handleFileUpload(e.target.files[0], currentValue)}
                              />
                            </label>
                          </div>
                          <small className="form-text text-muted">{field.description}</small>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={field.path}
                      className={
                        field.type === 'textarea' || field.type === 'array' ? 'col-12' : 'col-md-6'
                      }
                    >
                      <ConfigFieldRenderer
                        field={field}
                        currentValue={currentValue}
                        onFieldChange={handleFieldChange}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {Object.entries(section.subsections || {}).map(([subsectionName, subsection]) => {
          if (!shouldShowSubsection(subsection, subsectionName)) {
            return null;
          }

          const isCollapsed = isSubsectionCollapsed(sectionName, subsectionName);

          return (
            <div key={subsectionName} className="card mb-4">
              <div
                className="card-header cursor-pointer"
                role="button"
                tabIndex={0}
                onClick={() => toggleSubsection(sectionName, subsectionName)}
                onKeyPress={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    toggleSubsection(sectionName, subsectionName);
                  }
                }}
              >
                <h6 className="mb-0">
                  <i
                    className={`fas ${isCollapsed ? 'fa-chevron-right' : 'fa-chevron-down'} me-2`}
                  />
                  <i className={`${section.icon} me-2`} />{' '}
                  {t(`configManager.subsections.${subsection.key}`)}
                  <span className="badge bg-light text-dark ms-2">
                    {t('configManager.settingsCount', {
                      count: subsection.fields.length,
                    })}
                  </span>
                </h6>
              </div>
              {!isCollapsed && (
                <div className="card-body">
                  <div className="row">
                    {subsection.fields.map(field => {
                      const currentValue =
                        values[field.path] !== undefined ? values[field.path] : field.value;

                      if (field.upload) {
                        return (
                          <div key={field.path} className="col-md-6">
                            <div className="mb-3">
                              <label className="form-label">
                                {field.label}
                                {field.required && <span className="text-danger">*</span>}
                              </label>
                              <div className="input-group">
                                <input
                                  type="text"
                                  className="form-control"
                                  value={currentValue}
                                  onChange={e => handleFieldChange(field.path, e.target.value)}
                                  placeholder={field.placeholder}
                                />
                                <label className="btn btn-outline-secondary">
                                  {t('buttons.upload')}
                                  <input
                                    type="file"
                                    hidden
                                    onChange={e =>
                                      handleFileUpload(e.target.files[0], currentValue)
                                    }
                                  />
                                </label>
                              </div>
                              <small className="form-text text-muted">{field.description}</small>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={field.path}
                          className={
                            field.type === 'textarea' || field.type === 'array'
                              ? 'col-12'
                              : 'col-md-6'
                          }
                        >
                          <ConfigFieldRenderer
                            field={field}
                            currentValue={currentValue}
                            onFieldChange={handleFieldChange}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    ));
  };

  return (
    <div className="mt-5">
      <ul className="nav nav-tabs d-flex">
        <li className="nav-item">
          <button
            className={`nav-link ${selectedConfig === 'app' ? 'active' : ''}`}
            onClick={() => setSelectedConfig('app')}
          >
            {t('configManager.tabs.app')}
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${selectedConfig === 'auth' ? 'active' : ''}`}
            onClick={() => setSelectedConfig('auth')}
          >
            {t('configManager.tabs.auth')}
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${selectedConfig === 'db' ? 'active' : ''}`}
            onClick={() => setSelectedConfig('db')}
          >
            {t('configManager.tabs.db')}
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${selectedConfig === 'mail' ? 'active' : ''}`}
            onClick={() => setSelectedConfig('mail')}
          >
            {t('configManager.tabs.mail')}
          </button>
        </li>
        <li className="nav-item ms-auto">
          <button type="button" className="nav-link cursor-pointer" onClick={updateConfig}>
            {t('configManager.buttons.update')}
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className="nav-link"
            onClick={() => {
              api.config
                .restart()
                .then(() => {
                  notify('success', t('configManager.restartInitiated'));
                })
                .catch(() => {
                  notify('danger', t('configManager.restartFailed'));
                });
            }}
          >
            {t('configManager.buttons.restart')}
          </button>
        </li>
      </ul>
      <div className="config-container mt-3">
        <div>{renderConfigSections()}</div>
        {selectedConfig === 'mail' && (
          <div className="card mb-4">
            <div className="card-header">
              <h5 className="mb-0">
                <i className="fas fa-envelope-open-text me-2" />
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
                    onClick={handleTestSmtp}
                  >
                    {t('configManager.smtpTest.send')}
                  </button>
                </div>
                <small className="form-text text-muted">{t('configManager.smtpTest.hint')}</small>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConfigurationManager;
