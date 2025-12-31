import PropTypes from "prop-types";
import { useState, useEffect, useCallback } from "react";

import ConfigService from "../services/config.service";
import {
  processConfig,
  validateConfigValue,
} from "../utils/ConfigProcessorUtils";

import ConfigFieldRenderer from "./ConfigFieldRenderer.component";
import OidcProviderManager from "./OidcProviderManager.component";

/**
 * ConfigurationManager - Manages system configuration
 */
const ConfigurationManager = ({ setMessage, setMessageType }) => {
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
          console.error("Error fetching config:", error);
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
    if (subsectionName === "OIDC Providers") {
      return true;
    }
    // Hide individual OIDC provider subsections
    if (
      subsectionName &&
      subsectionName.includes("OIDC") &&
      subsectionName !== "OIDC Providers"
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
        const error = validateConfigValue(value.type, value.value);
        if (error) {
          newValidationErrors[key] = error;
          hasErrors = true;
        }
      }
    });

    if (hasErrors) {
      setSubmitError("Please fix the validation errors before submitting.");
      setIsFormValid(false);
      return;
    }

    setIsFormValid(true);

    ConfigService.updateConfig(selectedConfig, config).then(
      () => {
        setMessage("Configuration updated successfully.");
        setMessageType("success");
        setSubmitError("");
      },
      (error) => {
        console.error("Error updating config:", error);
        setMessage("Error updating configuration.");
        setMessageType("danger");
      }
    );
  };

  const handleConfigUpdate = (newConfig) => {
    ConfigService.updateConfig("auth", newConfig);
    setConfig(newConfig);
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
                      <i className={`${section.icon} me-2`} />
                      {section.title} Settings
                      <span className="badge bg-light text-dark ms-2">
                        {section.fields.length} setting
                        {section.fields.length !== 1 ? "s" : ""}
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

                  if (subsectionName === "OIDC Providers") {
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
                        className="card-header"
                        style={{ cursor: "pointer" }}
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
                          <i className={`${section.icon} me-2`} />
                          {subsection.title}
                          <span className="badge bg-light text-dark ms-2">
                            {subsection.fields.length} setting
                            {subsection.fields.length !== 1 ? "s" : ""}
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
                <i className={`${section.icon} me-2`} />
                {section.title} Settings
                <span className="badge bg-light text-dark ms-2">
                  {section.fields.length} setting
                  {section.fields.length !== 1 ? "s" : ""}
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
                  className="card-header"
                  style={{ cursor: "pointer" }}
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
                    <i className={`${section.icon} me-2`} />
                    {subsection.title}
                    <span className="badge bg-light text-dark ms-2">
                      {subsection.fields.length} setting
                      {subsection.fields.length !== 1 ? "s" : ""}
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
            App Config
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${selectedConfig === "auth" ? "active" : ""}`}
            onClick={() => setSelectedConfig("auth")}
          >
            Auth Config
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${selectedConfig === "db" ? "active" : ""}`}
            onClick={() => setSelectedConfig("db")}
          >
            DB Config
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${selectedConfig === "mail" ? "active" : ""}`}
            onClick={() => setSelectedConfig("mail")}
          >
            Email Config
          </button>
        </li>
        <li className="nav-item ms-auto">
          <button
            type="button"
            className={`nav-link ${!isFormValid ? "disabled" : ""}`}
            onClick={updateConfig}
            disabled={!isFormValid}
            style={{ cursor: isFormValid ? "pointer" : "not-allowed" }}
          >
            Update Configuration
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className="nav-link"
            onClick={() => {
              ConfigService.restartServer()
                .then(() => {
                  setMessage("Server restart initiated");
                  setMessageType("success");
                })
                .catch(() => {
                  setMessage("Failed to restart server");
                  setMessageType("danger");
                });
            }}
          >
            Restart Server
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
