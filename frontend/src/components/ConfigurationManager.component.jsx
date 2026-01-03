import PropTypes from "prop-types";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";

import AuthService from "../services/auth.service";
import ConfigService from "../services/config.service";
import {
  processConfig,
  validateConfigValue,
} from "../utils/ConfigProcessorUtils";
import { log } from "../utils/Logger";

import ConfigFieldRenderer from "./ConfigFieldRenderer.component";
import OidcProviderManager from "./OidcProviderManager.component";

/**
 * ConfigurationManager - Manages system configuration
 */
const ConfigurationManager = ({ setMessage, setMessageType }) => {
  const { t } = useTranslation();
  const [selectedConfig, setSelectedConfig] = useState("app");
  const [config, setConfig] = useState({});
  const [sections, setSections] = useState({});
  const [values, setValues] = useState({});
  const [collapsedSubsections, setCollapsedSubsections] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [isFormValid, setIsFormValid] = useState(true);

  const fetchConfig = useCallback(
    (configName) => {
      ConfigService.getConfig(configName).then(
        (response) => {
          setConfig(response.data);
          const { extractedValues, organizedSections } = processConfig(
            response.data,
            configName
          );
          setValues(extractedValues);
          setSections(organizedSections);
        },
        (error) => {
          log.api.error("Error fetching config", {
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
    setValues((prev) => ({
      ...prev,
      [fieldPath]: value,
    }));
  };

  const toggleSubsection = (sectionName, subsectionName) => {
    const key = `${sectionName}-${subsectionName}`;
    setCollapsedSubsections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const isSubsectionCollapsed = (sectionName, subsectionName) => {
    const key = `${sectionName}-${subsectionName}`;
    return collapsedSubsections[key] || false;
  };

  const shouldShowSubsection = (subsection, subsectionName) => {
    if (subsectionName === "oidcProviders") {
      return true;
    }
    // Hide individual OIDC provider subsections
    if (
      subsectionName &&
      subsectionName.toLowerCase().includes("oidc") &&
      subsectionName !== "oidcProviders"
    ) {
      return false;
    }
    return subsection.fields.length > 0;
  };

  const updateConfig = () => {
    const newValidationErrors = {};
    let hasErrors = false;

    Object.entries(config).forEach(([key, value]) => {
      if (
        typeof value === "object" &&
        value !== null &&
        "type" in value &&
        "value" in value
      ) {
        const error = validateConfigValue(value.type, value.value, t);
        if (error) {
          newValidationErrors[key] = error;
          hasErrors = true;
        }
      }
    });

    if (hasErrors) {
      setSubmitError(t("configManager.fixErrors"));
      setIsFormValid(false);
      return;
    }

    setIsFormValid(true);

    ConfigService.updateConfig(selectedConfig, config).then(
      () => {
        setMessage(t("configManager.updateSuccess"));
        setMessageType("success");
        setSubmitError("");
      },
      (error) => {
        log.component.error("Error updating config", {
          configName: selectedConfig,
          error: error.message,
        });
        setMessage(t("configManager.updateError"));
        setMessageType("danger");
      }
    );
  };

  const handleConfigUpdate = (newConfig) => {
    ConfigService.updateConfig("auth", newConfig);
    setConfig(newConfig);
  };

  const handleFileUpload = async (file, targetPath) => {
    if (!file || !targetPath) {
      return;
    }

    const user = AuthService.getCurrentUser();
    if (!user || !user.accessToken) {
      setMessage(t("error.unexpectedErrorOccurred"));
      setMessageType("danger");
      return;
    }

    try {
      const response = await fetch(
        `/api/config/ssl/upload?targetPath=${encodeURIComponent(targetPath)}`,
        {
          method: "POST",
          headers: {
            "x-access-token": user.accessToken,
            "Content-Type": "application/octet-stream",
          },
          body: file,
        }
      );

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      setMessage(
        `${t("messages.operationSuccessful")}. ${t("configManager.restartInitiated")}`
      );
      setMessageType("success");
    } catch (error) {
      log.component.error("Error uploading file", { error: error.message });
      setMessage(t("messages.uploadFailed"));
      setMessageType("danger");
    }
  };

  const renderConfigSections = () => {
    if (selectedConfig === "auth") {
      // Special rendering for auth config with OIDC provider management
      return (
        <>
          {Object.entries(sections).map(([sectionName, section]) => (
            <div key={sectionName}>
              {section.fields.length > 0 && (
                <div className="card mb-4">
                  <div className="card-header">
                    <h5 className="mb-0">
                      <i className={`${section.icon} me-2`} />{" "}
                      {t(`configManager.sections.${section.key}`)}
                      <span className="badge bg-light text-dark ms-2">
                        {t("configManager.settingsCount", {
                          count: section.fields.length,
                        })}
                      </span>
                    </h5>
                  </div>
                  <div className="card-body">
                    <div className="row">
                      {section.fields.map((field) => {
                        const currentValue =
                          values[field.path] !== undefined
                            ? values[field.path]
                            : field.value;
                        return (
                          <div
                            key={field.path}
                            className={
                              field.type === "textarea" ||
                              field.type === "array"
                                ? "col-12"
                                : "col-md-6"
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
              {Object.entries(section.subsections || {}).map(
                ([subsectionName, subsection]) => {
                  if (!shouldShowSubsection(subsection, subsectionName)) {
                    return null;
                  }

                  if (subsectionName === "oidcProviders") {
                    return (
                      <OidcProviderManager
                        key={subsectionName}
                        config={config}
                        onConfigUpdate={handleConfigUpdate}
                        setMessage={setMessage}
                        setMessageType={setMessageType}
                      />
                    );
                  }

                  const isCollapsed = isSubsectionCollapsed(
                    sectionName,
                    subsectionName
                  );

                  return (
                    <div key={subsectionName} className="card mb-4">
                      <div
                        className="card-header cursor-pointer"
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          toggleSubsection(sectionName, subsectionName)
                        }
                        onKeyPress={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            toggleSubsection(sectionName, subsectionName);
                          }
                        }}
                      >
                        <h6 className="mb-0">
                          <i
                            className={`fas ${isCollapsed ? "fa-chevron-right" : "fa-chevron-down"} me-2`}
                          />
                          <i className={`${section.icon} me-2`} />{" "}
                          {t(`configManager.subsections.${subsection.key}`)}
                          <span className="badge bg-light text-dark ms-2">
                            {t("configManager.settingsCount", {
                              count: subsection.fields.length,
                            })}
                          </span>
                        </h6>
                      </div>
                      {!isCollapsed && (
                        <div className="card-body">
                          <div className="row">
                            {subsection.fields.map((field) => {
                              const currentValue =
                                values[field.path] !== undefined
                                  ? values[field.path]
                                  : field.value;

                              if (field.upload) {
                                return (
                                  <div key={field.path} className="col-md-6">
                                    <div className="mb-3">
                                      <label className="form-label">
                                        {field.label}
                                        {field.required && (
                                          <span className="text-danger">*</span>
                                        )}
                                      </label>
                                      <div className="input-group">
                                        <input
                                          type="text"
                                          className="form-control"
                                          value={currentValue}
                                          onChange={(e) =>
                                            handleFieldChange(
                                              field.path,
                                              e.target.value
                                            )
                                          }
                                          placeholder={field.placeholder}
                                        />
                                        <label className="btn btn-outline-secondary">
                                          {t("buttons.upload")}
                                          <input
                                            type="file"
                                            hidden
                                            onChange={(e) =>
                                              handleFileUpload(
                                                e.target.files[0],
                                                currentValue
                                              )
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
                                    field.type === "textarea" ||
                                    field.type === "array"
                                      ? "col-12"
                                      : "col-md-6"
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
                }
              )}
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
                <i className={`${section.icon} me-2`} />{" "}
                {t(`configManager.sections.${section.key}`)}
                <span className="badge bg-light text-dark ms-2">
                  {t("configManager.settingsCount", {
                    count: section.fields.length,
                  })}
                </span>
              </h5>
            </div>
            <div className="card-body">
              <div className="row">
                {section.fields.map((field) => {
                  const currentValue =
                    values[field.path] !== undefined
                      ? values[field.path]
                      : field.value;
                  return (
                    <div
                      key={field.path}
                      className={
                        field.type === "textarea" || field.type === "array"
                          ? "col-12"
                          : "col-md-6"
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

        {Object.entries(section.subsections || {}).map(
          ([subsectionName, subsection]) => {
            if (!shouldShowSubsection(subsection, subsectionName)) {
              return null;
            }

            const isCollapsed = isSubsectionCollapsed(
              sectionName,
              subsectionName
            );

            return (
              <div key={subsectionName} className="card mb-4">
                <div
                  className="card-header cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleSubsection(sectionName, subsectionName)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      toggleSubsection(sectionName, subsectionName);
                    }
                  }}
                >
                  <h6 className="mb-0">
                    <i
                      className={`fas ${isCollapsed ? "fa-chevron-right" : "fa-chevron-down"} me-2`}
                    />
                    <i className={`${section.icon} me-2`} />{" "}
                    {t(`configManager.subsections.${subsection.key}`)}
                    <span className="badge bg-light text-dark ms-2">
                      {t("configManager.settingsCount", {
                        count: subsection.fields.length,
                      })}
                    </span>
                  </h6>
                </div>
                {!isCollapsed && (
                  <div className="card-body">
                    <div className="row">
                      {subsection.fields.map((field) => {
                        const currentValue =
                          values[field.path] !== undefined
                            ? values[field.path]
                            : field.value;
                        return (
                          <div
                            key={field.path}
                            className={
                              field.type === "textarea" ||
                              field.type === "array"
                                ? "col-12"
                                : "col-md-6"
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
          }
        )}
      </div>
    ));
  };

  return (
    <div className="mt-5">
      <ul className="nav nav-tabs d-flex">
        <li className="nav-item">
          <button
            className={`nav-link ${selectedConfig === "app" ? "active" : ""}`}
            onClick={() => setSelectedConfig("app")}
          >
            {t("configManager.tabs.app")}
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${selectedConfig === "auth" ? "active" : ""}`}
            onClick={() => setSelectedConfig("auth")}
          >
            {t("configManager.tabs.auth")}
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${selectedConfig === "db" ? "active" : ""}`}
            onClick={() => setSelectedConfig("db")}
          >
            {t("configManager.tabs.db")}
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${selectedConfig === "mail" ? "active" : ""}`}
            onClick={() => setSelectedConfig("mail")}
          >
            {t("configManager.tabs.mail")}
          </button>
        </li>
        <li className="nav-item ms-auto">
          <button
            type="button"
            className={`nav-link ${!isFormValid ? "disabled" : "cursor-pointer"}`}
            onClick={updateConfig}
            disabled={!isFormValid}
          >
            {t("configManager.buttons.update")}
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className="nav-link"
            onClick={() => {
              ConfigService.restartServer()
                .then(() => {
                  setMessage(t("configManager.restartInitiated"));
                  setMessageType("success");
                })
                .catch(() => {
                  setMessage(t("configManager.restartFailed"));
                  setMessageType("danger");
                });
            }}
          >
            {t("configManager.buttons.restart")}
          </button>
        </li>
      </ul>
      {submitError && (
        <div className="alert alert-warning mt-3" role="alert">
          {submitError}
        </div>
      )}
      <div className="config-container mt-3">
        <div>{renderConfigSections()}</div>
      </div>
    </div>
  );
};

ConfigurationManager.propTypes = {
  setMessage: PropTypes.func.isRequired,
  setMessageType: PropTypes.func.isRequired,
};

export default ConfigurationManager;
