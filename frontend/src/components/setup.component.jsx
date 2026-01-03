import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FaEye, FaEyeSlash } from "react-icons/fa6";
import { useNavigate } from "react-router-dom";

import SetupService from "../services/setup.service";
import { log } from "../utils/Logger";

const SetupComponent = () => {
  const { t } = useTranslation();
  const [configs, setConfigs] = useState({
    db: {},
    app: {},
    auth: {},
    mail: {},
  });
  const [setupComplete, setSetupComplete] = useState(false);
  const [setupToken, setSetupToken] = useState("");
  const [authorizedSetupToken, setAuthorizedSetupToken] = useState("");
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState("db");
  const [validationErrors, setValidationErrors] = useState({});
  const [showPasswords, setShowPasswords] = useState({});
  const [isFormValid, setIsFormValid] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    document.title = t("setup.title");
  }, [t]);

  useEffect(() => {
    SetupService.isSetupComplete()
      .then((response) => {
        setSetupComplete(response.data.setupComplete);
      })
      .catch((error) => {
        log.api.error("Error checking setup status", {
          error: error.message,
        });
      });
  }, []);

  // Helper: Validate URL
  const validateUrl = (value) => {
    try {
      new URL(value);
      return null;
    } catch {
      return t("validation.invalidUrl");
    }
  };

  // Helper: Validate host (IP, FQDN, or localhost)
  const validateHost = (value) => {
    if (value === "localhost" || value === "127.0.0.1") {
      return null;
    }
    const ipRegex =
      /^(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const fqdnRegex =
      /^(?!:\/\/)(?=.{1,255}$)(?:(?:.{1,63}\.){1,127}(?![0-9]*$)[a-z0-9-]+\.?)$/i;
    if (ipRegex.test(value) || fqdnRegex.test(value)) {
      return null;
    }
    return t("validation.invalidHost");
  };

  // Helper: Validate other field types
  const validateOtherTypes = (type, value) => {
    switch (type) {
      case "integer": {
        return Number.isInteger(Number(value))
          ? null
          : t("validation.integerRequired");
      }
      case "boolean": {
        return typeof value === "boolean"
          ? null
          : t("validation.booleanRequired");
      }
      case "password": {
        return value.length >= 6 ? null : t("validation.passwordLength");
      }
      case "email": {
        const emailRegex =
          /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
        return emailRegex.test(value) ? null : t("validation.invalidEmail");
      }
      case "port": {
        const port = Number(value);
        return port >= 1 && port <= 65535 ? null : t("validation.portRange");
      }
      case "string": {
        return value.trim() !== "" ? null : t("validation.valueRequired");
      }
      default:
        return null;
    }
  };

  const getValidationError = (type, value, isReadonly = false) => {
    // Skip validation for readonly fields
    if (isReadonly) {
      return null;
    }

    if (value === null || value === undefined || value === "") {
      return t("validation.valueRequired");
    }

    if (type === "url") {
      return validateUrl(value);
    }
    if (type === "host") {
      return validateHost(value);
    }
    return validateOtherTypes(type, value);
  };

  const updateFormValidity = (errors) => {
    const hasErrors = ["db", "app", "auth", "mail"].some((configName) =>
      Object.values(errors[configName] || {}).some((error) => error !== null)
    );
    setIsFormValid(!hasErrors);
  };

  const validateField = (configName, path, value) => {
    const field = path.reduce(
      (acc, key) => acc && acc[key],
      configs[configName]
    );
    const isReadonly = field && field.readonly;
    const error =
      field && field.type
        ? getValidationError(field.type, value, isReadonly)
        : t("validation.invalidFieldStructure");

    setValidationErrors((prevErrors) => {
      const newErrors = {
        ...prevErrors,
        [configName]: {
          ...prevErrors[configName],
          [path.join(".")]: error,
        },
      };
      updateFormValidity(newErrors);
      return newErrors;
    });
  };

  const handleVerifyToken = () => {
    SetupService.verifySetupToken(setupToken)
      .then((tokenResponse) => {
        setAuthorizedSetupToken(tokenResponse.data.authorizedSetupToken);
        SetupService.getConfigs(tokenResponse.data.authorizedSetupToken)
          .then((configResponse) => {
            const newConfigs = configResponse.data.configs;

            // Auto-populate dialect on initial load if database_type is set but dialect is empty
            if (
              newConfigs.db &&
              newConfigs.db.database_type &&
              newConfigs.db.sql &&
              newConfigs.db.sql.dialect
            ) {
              const dbType = newConfigs.db.database_type.value;
              if (
                dbType &&
                (!newConfigs.db.sql.dialect.value ||
                  newConfigs.db.sql.dialect.value.trim() === "")
              ) {
                newConfigs.db.sql.dialect.value = dbType;
              }
            }

            setConfigs(newConfigs);

            // Perform initial validation
            const errors = {};
            Object.keys(newConfigs).forEach((configName) => {
              errors[configName] = {};
              const validateFields = (obj, path = []) => {
                Object.entries(obj).forEach(([key, value]) => {
                  const currentPath = [...path, key];
                  if (typeof value === "object" && value !== null) {
                    if ("type" in value && "value" in value) {
                      const isReadonly = value.readonly || false;
                      errors[configName][currentPath.join(".")] =
                        getValidationError(value.type, value.value, isReadonly);
                    } else {
                      validateFields(value, currentPath);
                    }
                  }
                });
              };
              validateFields(newConfigs[configName]);
            });
            setValidationErrors(errors);
            updateFormValidity(errors);
          })
          .catch((error) => {
            log.api.error("Error fetching configs", {
              error: error.message,
            });
          });
      })
      .catch((error) => {
        log.api.error("Error verifying setup token", {
          error: error.message,
        });
        setMessage(t("setup.invalidToken"));
      });
  };

  const handleConfigChange = (configName, path, value) => {
    setConfigs((prevConfigs) => {
      const newConfigs = { ...prevConfigs };
      let current = newConfigs[configName];
      for (let i = 0; i < path.length - 1; i++) {
        if (current[path[i]] === null) {
          current[path[i]] = {};
        }
        current = current[path[i]];
      }
      if (current[path[path.length - 1]] === null) {
        current[path[path.length - 1]] = { value };
      } else {
        current[path[path.length - 1]].value = value;
      }

      // Auto-populate dialect when database_type changes
      if (configName === "db" && path.join(".") === "database_type") {
        if (newConfigs.db.sql && newConfigs.db.sql.dialect) {
          newConfigs.db.sql.dialect.value = value;
        }
      }

      return newConfigs;
    });

    validateField(configName, path, value);

    // Also validate dialect field when database type changes
    if (configName === "db" && path.join(".") === "database_type") {
      validateField(configName, ["sql", "dialect"], value);
    }
  };

  // Helper: Render SQLite storage field
  const renderSqliteStorage = (configName, entry) => {
    const storageEntry = entry.storage;
    if (!storageEntry) {
      return null;
    }
    const storageError =
      validationErrors[configName] &&
      validationErrors[configName]["sql.storage"];
    return (
      <div className="form-group" key="sql.storage">
        <label htmlFor="sql-storage">{t("setup.sqlitePath")}</label>
        <input
          id="sql-storage"
          type="text"
          className={`form-control ${storageError ? "is-invalid" : ""}`}
          value={storageEntry.value || ""}
          onChange={(e) =>
            handleConfigChange(configName, ["sql", "storage"], e.target.value)
          }
        />
        <small className="form-text text-muted">
          {storageEntry.description}
        </small>
        {storageError && <div className="invalid-feedback">{storageError}</div>}
      </div>
    );
  };

  // Helper: Render OIDC provider info
  const renderOidcInfo = (errorKey) => (
    <div key={errorKey} className="col-md-12 mb-3">
      <div className="alert alert-info">
        <h6>
          <i className="fas fa-info-circle me-2" />
          {t("oidc.title")}
        </h6>
        <p className="mb-0">{t("setup.oidcNote")}</p>
      </div>
    </div>
  );

  // Helper: Render form input field
  const renderInputField = (
    configName,
    currentPath,
    entry,
    errorKey,
    error
  ) => {
    const { type, value, description, options } = entry;
    const inputValue = value === null || value === undefined ? "" : value;
    const fieldId = `field-${errorKey}`;

    if (type === "select") {
      return (
        <div className="form-group" key={errorKey}>
          <label htmlFor={fieldId}>{currentPath[currentPath.length - 1]}</label>
          <select
            id={fieldId}
            className={`form-control ${error ? "is-invalid" : ""}`}
            value={inputValue}
            onChange={(e) =>
              handleConfigChange(configName, currentPath, e.target.value)
            }
          >
            {options &&
              options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
          </select>
          <small className="form-text text-muted">{description}</small>
          {error && <div className="invalid-feedback">{error}</div>}
        </div>
      );
    }

    if (type === "password") {
      return (
        <div className="form-group" key={errorKey}>
          <label htmlFor={fieldId}>{currentPath[currentPath.length - 1]}</label>
          <div className="input-group">
            <input
              id={fieldId}
              type={showPasswords[errorKey] ? "text" : "password"}
              className={`form-control ${error ? "is-invalid" : ""}`}
              value={inputValue}
              onChange={(e) =>
                handleConfigChange(configName, currentPath, e.target.value)
              }
            />
            <button
              className="btn btn-outline-secondary"
              type="button"
              onClick={() =>
                setShowPasswords((prev) => ({
                  ...prev,
                  [errorKey]: !prev[errorKey],
                }))
              }
            >
              {showPasswords[errorKey] ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>
          <small className="form-text text-muted">{description}</small>
          {error && <div className="invalid-feedback">{error}</div>}
        </div>
      );
    }

    return (
      <div className="form-group" key={errorKey}>
        <label htmlFor={fieldId}>{currentPath[currentPath.length - 1]}</label>
        <input
          id={fieldId}
          type="text"
          className={`form-control ${error ? "is-invalid" : ""} ${entry.readonly ? "readonly-input" : ""}`}
          value={inputValue}
          onChange={(e) =>
            handleConfigChange(configName, currentPath, e.target.value)
          }
          readOnly={entry.readonly}
        />
        <small className="form-text text-muted">{description}</small>
        {error && <div className="invalid-feedback">{error}</div>}
      </div>
    );
  };

  const renderConfigFields = (configName) => {
    const renderFields = (obj, path = []) =>
      Object.keys(obj).map((key) => {
        const currentPath = [...path, key];
        const entry = obj[key];
        const errorKey = currentPath.join(".");
        const error =
          validationErrors[configName] &&
          validationErrors[configName][errorKey];

        // Handle database type conditional visibility
        if (configName === "db") {
          const databaseType = configs.db.database_type?.value || "mysql";

          if (key === "sql") {
            if (databaseType === "sqlite") {
              return renderSqliteStorage(configName, entry);
            }
          }

          // Hide mysql_pool section when SQLite is selected
          if (key === "mysql_pool" && databaseType === "sqlite") {
            return null;
          }
        }

        if (
          typeof entry === "object" &&
          entry !== null &&
          !("type" in entry && "value" in entry)
        ) {
          return (
            <div key={errorKey} className="col-md-6 mb-3">
              <div className="card">
                <div className="card-header">
                  <h5>{key}</h5>
                </div>
                <div className="card-body">
                  {renderFields(entry, currentPath)}
                </div>
              </div>
            </div>
          );
        }

        if (key === "oidc_providers" && entry.type === "object") {
          return renderOidcInfo(errorKey);
        }

        return renderInputField(
          configName,
          currentPath,
          entry,
          errorKey,
          error
        );
      });

    return renderFields(configs[configName]);
  };

  const handleSubmit = () => {
    if (!isFormValid) {
      setMessage(t("validation.fixErrors"));
      return;
    }

    SetupService.updateConfigs(authorizedSetupToken, configs)
      .then(() => {
        setMessage(t("setup.updateSuccess"));

        // Set a 5-second delay before navigating
        setTimeout(() => {
          navigate("/register");
        }, 5000);
      })
      .catch((error) => {
        log.api.error("Error updating configuration", {
          error: error.message,
        });
        setMessage(t("setup.updateError"));
      });
  };

  useEffect(() => {
    if (authorizedSetupToken) {
      SetupService.getConfigs(authorizedSetupToken)
        .then((response) => {
          log.component.debug("Fetched configs", {
            configs: response.data.configs,
          });
          setConfigs(response.data.configs);
        })
        .catch((error) => {
          log.api.error("Error fetching configs", {
            error: error.message,
          });
        });
    }
  }, [authorizedSetupToken]);

  // Helper: Get tab validation status class
  const getTabStatusClass = (configName) => {
    if (!validationErrors[configName]) {
      return "";
    }
    const hasErrors = Object.values(validationErrors[configName]).some(
      (error) => error !== null
    );
    return hasErrors ? "" : "text-success";
  };

  return (
    <div className="container mt-5">
      <h2 className="text-center mb-4">{t("setup.title")}</h2>
      {setupComplete ? (
        <div className="alert alert-success" role="alert">
          {t("setup.alreadyComplete")}
        </div>
      ) : (
        <>
          {!authorizedSetupToken ? (
            <div className="card">
              <div className="card-body">
                <h5 className="card-title">{t("setup.enterToken")}</h5>
                <div className="input-group mb-3">
                  <input
                    type="text"
                    className="form-control"
                    placeholder={t("setup.tokenPlaceholder")}
                    value={setupToken}
                    onChange={(e) => setSetupToken(e.target.value)}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={handleVerifyToken}
                  >
                    {t("setup.verifyToken")}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <ul className="nav nav-tabs mb-4 d-flex">
                {["db", "app", "auth", "mail"].map((configName) => (
                  <li className="nav-item" key={configName}>
                    <button
                      className={`nav-link ${activeTab === configName ? "active" : ""} ${getTabStatusClass(configName)}`}
                      onClick={() => setActiveTab(configName)}
                    >
                      {configName.charAt(0).toUpperCase() + configName.slice(1)}{" "}
                      Config
                    </button>
                  </li>
                ))}
                <li className="nav-item ms-auto">
                  <button
                    type="button"
                    className={`nav-link ${!isFormValid ? "disabled" : "cursor-pointer"}`}
                    onClick={handleSubmit}
                    disabled={!isFormValid}
                  >
                    {t("setup.submitAll")}
                  </button>
                </li>
              </ul>

              <div className="tab-content">
                {["db", "app", "auth", "mail"].map((configName) => (
                  <div
                    key={configName}
                    className={`tab-pane ${activeTab === configName ? "active" : ""}`}
                  >
                    <div className="row">{renderConfigFields(configName)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {message && (
            <div className="alert alert-info mt-3" role="alert">
              {message}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SetupComponent;
