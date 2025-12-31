import React, { useState, useEffect } from "react";
import { FaEye, FaEyeSlash } from "react-icons/fa6";
import { Link, useNavigate } from "react-router-dom";

import EventBus from "../common/EventBus";
import AuthService from "../services/auth.service";
import ConfigService from "../services/config.service";
import OrganizationService from "../services/organization.service";
import UserService from "../services/user.service";

import ConfirmationModal from "./confirmation.component";

const Admin = () => {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState([]);
  const [selectedConfig, setSelectedConfig] = useState("app");
  const [config, setConfig] = useState({});
  const [sections, setSections] = useState({});
  const [values, setValues] = useState({});
  const [collapsedSubsections, setCollapsedSubsections] = useState({});
  const [editingOrgId, setEditingOrgId] = useState(null);
  const [newOrgName, setNewOrgName] = useState("");
  const [activeTab, setActiveTab] = useState("organizations");
  const [oldName, setOldName] = useState("");
  const [renameMessage, setRenameMessage] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [showPasswords, setShowPasswords] = useState({});
  const [isFormValid, setIsFormValid] = useState(true);
  const [showOidcProviderModal, setShowOidcProviderModal] = useState(false);
  const [oidcProviderForm, setOidcProviderForm] = useState({
    name: "",
    displayName: "",
    issuer: "",
    clientId: "",
    clientSecret: "",
    scope: "openid profile email",
    responseType: "code",
    enabled: true,
  });
  const [oidcProviderLoading, setOidcProviderLoading] = useState(false);
  const [editingProvider, setEditingProvider] = useState(null);

  // Authentication guard - redirect if not authenticated or not admin
  useEffect(() => {
    const currentUser = AuthService.getCurrentUser();

    if (!currentUser) {
      // Not authenticated, redirect to login
      navigate("/login");
      return;
    }

    if (!currentUser.roles || !currentUser.roles.includes("ROLE_ADMIN")) {
      // Authenticated but not admin, redirect to home
      navigate("/");
    }
  }, [navigate]);

  useEffect(() => {
    OrganizationService.getOrganizationsWithUsers().then(
      (response) => {
        setOrganizations(response.data);
      },
      (error) => {
        if (error.response && error.response.status === 401) {
          EventBus.dispatch("logout");
        }
      }
    );

    fetchConfig(selectedConfig);
  }, [selectedConfig]);

  const handleDeleteUser = (userId) => {
    UserService.deleteUser(userId).then(() => {
      setOrganizations((prev) =>
        prev.map((org) => ({
          ...org,
          users: org.users.filter((user) => user.id !== userId),
        }))
      );
    });
  };

  const handleDeleteClick = (item) => {
    setItemToDelete(item);
    setShowDeleteModal(true);
  };

  const handleCloseDeleteModal = () => {
    setShowDeleteModal(false);
    setItemToDelete(null);
  };

  const handleConfirmDelete = () => {
    if (itemToDelete) {
      // Perform the deletion based on the item type
      if (itemToDelete.type === "user") {
        handleDeleteUser(itemToDelete.id);
      } else if (itemToDelete.type === "organization") {
        handleDeleteOrganization(itemToDelete.name);
      }
      handleCloseDeleteModal();
    }
  };

  const handleSuspendOrResumeUser = (userId, isSuspended) => {
    if (isSuspended) {
      UserService.resumeUser(userId).then(() => {
        setOrganizations((prev) =>
          prev.map((org) => ({
            ...org,
            users: org.users.map((user) =>
              user.id === userId ? { ...user, suspended: false } : user
            ),
          }))
        );
      });
    } else {
      UserService.suspendUser(userId).then(() => {
        setOrganizations((prev) =>
          prev.map((org) => ({
            ...org,
            users: org.users.map((user) =>
              user.id === userId ? { ...user, suspended: true } : user
            ),
          }))
        );
      });
    }
  };

  const handleDeleteOrganization = (organizationName) => {
    OrganizationService.deleteOrganization(organizationName).then(() => {
      setOrganizations((prev) =>
        prev.filter((org) => org.name !== organizationName)
      );
    });
  };

  const handleSuspendOrResumeOrganization = (organizationName, isSuspended) => {
    if (isSuspended) {
      OrganizationService.resumeOrganization(organizationName).then(() => {
        setOrganizations((prev) =>
          prev.map((org) =>
            org.name === organizationName ? { ...org, suspended: false } : org
          )
        );
      });
    } else {
      OrganizationService.suspendOrganization(organizationName).then(() => {
        setOrganizations((prev) =>
          prev.map((org) =>
            org.name === organizationName ? { ...org, suspended: true } : org
          )
        );
      });
    }
  };

  const handlePromoteUser = (userId) => {
    UserService.promoteToModerator(userId).then(() => {
      setOrganizations((prev) =>
        prev.map((org) => ({
          ...org,
          users: org.users.map((user) =>
            user.id === userId
              ? { ...user, roles: [{ name: "moderator" }] }
              : user
          ),
        }))
      );
    });
  };

  const handleDemoteUser = (userId) => {
    UserService.demoteToUser(userId).then(() => {
      setOrganizations((prev) =>
        prev.map((org) => ({
          ...org,
          users: org.users.map((user) =>
            user.id === userId ? { ...user, roles: [{ name: "user" }] } : user
          ),
        }))
      );
    });
  };

  const validateOrgName = (orgName) => {
    const validCharsRegex = /^[0-9a-zA-Z-._]+$/;
    if (!orgName || !validCharsRegex.test(orgName)) {
      return "Invalid organization name. Only alphanumeric characters, hyphens, underscores, and periods are allowed.";
    }
    return null;
  };

  const handleRenameOrganization = async (e) => {
    e.preventDefault();
    const validationError = validateOrgName(newOrgName);
    if (validationError) {
      setRenameMessage(validationError);
      return;
    }

    if (newOrgName === oldName) {
      setRenameMessage(
        "New name is the same as the old name. Please enter a different name."
      );
      return;
    }

    const organizationExists = await checkOrganizationExists(newOrgName);
    if (organizationExists) {
      setRenameMessage(
        "An organization with this name already exists. Please choose a different name."
      );
      return;
    }

    try {
      await OrganizationService.updateOrganization(oldName, {
        organization: newOrgName,
      });

      // Update the user's organization in localStorage if they renamed their own org
      const currentUser = AuthService.getCurrentUser();
      if (currentUser && currentUser.organization === oldName) {
        currentUser.organization = newOrgName;
        localStorage.setItem("user", JSON.stringify(currentUser));

        // Trigger an EventBus event to update App.jsx state
        EventBus.dispatch("organizationUpdated", {
          oldName,
          newName: newOrgName,
        });
      }

      setOrganizations((prevOrgs) =>
        prevOrgs.map((org) =>
          org.name === oldName ? { ...org, name: newOrgName } : org
        )
      );
      setEditingOrgId(null);
      setNewOrgName("");
      setOldName("");
      setRenameMessage("Organization renamed successfully!");
    } catch (error) {
      console.error("Error renaming organization:", error);
      setRenameMessage("Error renaming organization. Please try again.");
    }
  };

  const fetchConfig = (configName) => {
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
  };

  const processConfig = (config, configType) => {
    const extractedValues = {};
    const organizedSections = {};

    const processObject = (obj, path = "", sectionName = "General") => {
      for (const [key, value] of Object.entries(obj || {})) {
        const fullPath = path ? `${path}.${key}` : key;

        if (
          value &&
          typeof value === "object" &&
          value.type &&
          value.hasOwnProperty("value")
        ) {
          extractedValues[fullPath] = value.value;

          const section =
            value.section || inferSection(fullPath, configType) || sectionName;
          const subsection =
            value.subsection || inferSubsection(fullPath, section, configType);

          if (!organizedSections[section]) {
            organizedSections[section] = {
              title: section,
              icon: getSectionIcon(section),
              description: "",
              fields: [],
              subsections: {},
            };
          }

          const fieldData = {
            key: fullPath,
            path: fullPath,
            type: value.type,
            label: generateLabel(key),
            description: value.description || "",
            placeholder: value.placeholder || "",
            required: value.required || false,
            options: value.options || null,
            order: value.order || 0,
            value: value.value,
          };

          if (
            value.type === "object" &&
            value.value &&
            typeof value.value === "object"
          ) {
            if (subsection) {
              if (!organizedSections[section].subsections[subsection]) {
                organizedSections[section].subsections[subsection] = {
                  title: subsection,
                  fields: [],
                };
              }
            }
            processObject(value.value, fullPath, section);
          } else if (subsection) {
            if (!organizedSections[section].subsections[subsection]) {
              organizedSections[section].subsections[subsection] = {
                title: subsection,
                fields: [],
              };
            }
            organizedSections[section].subsections[subsection].fields.push(
              fieldData
            );
          } else {
            organizedSections[section].fields.push(fieldData);
          }
        } else if (
          value &&
          typeof value === "object" &&
          value.type &&
          value.hasOwnProperty("providers")
        ) {
          // Handle objects with 'providers' property (like oidc)
          const section =
            value.section || inferSection(fullPath, configType) || sectionName;
          const subsection =
            value.subsection || inferSubsection(fullPath, section, configType);

          if (!organizedSections[section]) {
            organizedSections[section] = {
              title: section,
              icon: getSectionIcon(section),
              description: "",
              fields: [],
              subsections: {},
            };
          }

          if (subsection) {
            if (!organizedSections[section].subsections[subsection]) {
              organizedSections[section].subsections[subsection] = {
                title: subsection,
                fields: [],
              };
            }
          }

          // Process the providers
          processObject(value.providers, `${fullPath}.providers`, section);
        } else if (
          value &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          !value.hasOwnProperty("type")
        ) {
          const inferredSection =
            inferSection(fullPath, configType) || sectionName;
          processObject(value, fullPath, inferredSection);
        }
      }
    };

    processObject(config);

    Object.values(organizedSections).forEach((section) => {
      section.fields.sort((a, b) => (a.order || 0) - (b.order || 0));
      Object.values(section.subsections).forEach((subsection) => {
        subsection.fields.sort((a, b) => (a.order || 0) - (b.order || 0));
      });
    });

    return { extractedValues, organizedSections };
  };

  const inferSection = (path, configType) => {
    const sectionMaps = {
      auth: {
        auth: "Authentication",
        jwt: "Authentication",
        local: "Authentication",
        external: "Authentication",
        oidc: "Authentication",
        oidc_providers: "Authentication",
      },
      app: {
        boxvault: "Application",
        gravatar: "Application",
        ssl: "Application",
      },
      db: {
        sql: "Database",
        mysql_pool: "Database",
        database_type: "Database",
      },
      mail: {
        smtp_connect: "Mail",
        smtp_settings: "Mail",
        smtp_auth: "Mail",
      },
    };

    const sectionMap = sectionMaps[configType] || {};
    const pathParts = path.split(".");
    return (
      sectionMap[pathParts[0]] ||
      sectionMap[pathParts[1]] ||
      (configType
        ? configType.charAt(0).toUpperCase() + configType.slice(1)
        : "General")
    );
  };

  const inferSubsection = (path, section, configType) => {
    if (section === "Authentication") {
      const pathParts = path.split(".");
      if (pathParts.includes("jwt")) {
        return "JWT Settings";
      }
      if (pathParts.includes("local")) {
        return "Local Authentication";
      }
      if (pathParts.includes("external")) {
        return "External Providers";
      }
      if (pathParts.includes("oidc_providers")) {
        return "OIDC Providers";
      }
    } else if (section === "Application") {
      const pathParts = path.split(".");
      if (pathParts.includes("boxvault")) {
        return "BoxVault Settings";
      }
      if (pathParts.includes("gravatar")) {
        return "Gravatar Settings";
      }
      if (pathParts.includes("ssl")) {
        return "SSL Settings";
      }
    } else if (section === "Database") {
      const pathParts = path.split(".");
      if (pathParts.includes("sql")) {
        return "Database Connection";
      }
      if (pathParts.includes("mysql_pool")) {
        return "Connection Pool";
      }
    } else if (section === "Mail") {
      const pathParts = path.split(".");
      if (pathParts.includes("smtp_connect")) {
        return "SMTP Connection";
      }
      if (pathParts.includes("smtp_settings")) {
        return "SMTP Settings";
      }
      if (pathParts.includes("smtp_auth")) {
        return "SMTP Authentication";
      }
    }
    return null;
  };

  const generateLabel = (fieldName) => {
    if (!fieldName || typeof fieldName !== "string") {
      return fieldName || "";
    }
    return fieldName
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const getSectionIcon = (section) => {
    const iconMap = {
      Authentication: "fas fa-shield-alt",
      Database: "fas fa-database",
      Mail: "fas fa-envelope",
      Application: "fas fa-cogs",
    };
    return iconMap[section] || "fas fa-cog";
  };

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
    // Hide individual OIDC provider subsections (like "Google OIDC")
    if (
      subsectionName &&
      subsectionName.includes("OIDC") &&
      subsectionName !== "OIDC Providers"
    ) {
      return false;
    }
    return subsection.fields.length > 0;
  };

  const renderField = (field) => {
    const currentValue =
      values[field.path] !== undefined ? values[field.path] : field.value;

    const fieldProps = {
      key: field.path,
      value: currentValue || "",
      onChange: (e) => {
        const value =
          field.type === "boolean" ? e.target.checked : e.target.value;
        handleFieldChange(field.path, value);
      },
      placeholder: field.placeholder,
      required: field.required,
    };

    let inputElement;

    switch (field.type) {
      case "boolean":
        inputElement = (
          <div className="form-check">
            <input
              type="checkbox"
              className="form-check-input"
              checked={!!currentValue}
              onChange={fieldProps.onChange}
            />
            <label className="form-check-label">{field.label}</label>
          </div>
        );
        break;
      case "select":
        inputElement = (
          <select className="form-select" {...fieldProps}>
            {field.options
              ? field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))
              : null}
          </select>
        );
        break;
      case "password":
        inputElement = (
          <div className="input-group">
            <input
              type={showPasswords[field.path] ? "text" : "password"}
              className="form-control"
              {...fieldProps}
            />
            <button
              className="btn btn-outline-secondary"
              type="button"
              onClick={() =>
                setShowPasswords((prev) => ({
                  ...prev,
                  [field.path]: !prev[field.path],
                }))
              }
            >
              {showPasswords[field.path] ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>
        );
        break;
      case "textarea":
        inputElement = (
          <textarea className="form-control" {...fieldProps} rows={3} />
        );
        break;
      case "array":
        const arrayValue = Array.isArray(currentValue)
          ? currentValue.join(",")
          : currentValue || "";
        inputElement = (
          <input
            type="text"
            className="form-control"
            value={arrayValue}
            onChange={(e) =>
              handleFieldChange(field.path, e.target.value.split(","))
            }
            placeholder="Comma-separated values"
          />
        );
        break;
      default:
        inputElement = (
          <input type="text" className="form-control" {...fieldProps} />
        );
    }

    return (
      <div className="mb-3" key={field.path}>
        {field.type !== "boolean" ? (
          <label className="form-label">{field.label}</label>
        ) : null}
        {inputElement}
        {field.description ? (
          <div className="form-text">{field.description}</div>
        ) : null}
      </div>
    );
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

    setValidationErrors(newValidationErrors);

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

  const handleConfigChange = (path, value) => {
    setConfig((prevConfig) => {
      const newConfig = { ...prevConfig };
      let current = newConfig;
      for (let i = 0; i < path.length - 1; i++) {
        current = current[path[i]];
      }
      current[path[path.length - 1]].value = value;
      return newConfig;
    });

    const { type } = path.reduce((acc, key) => acc && acc[key], config);
    const validationError = validateConfigValue(type, value);

    setValidationErrors((prevErrors) => {
      const newErrors = { ...prevErrors, [path.join(".")]: validationError };
      // Update form validity
      const hasErrors = Object.values(newErrors).some(
        (error) => error !== null
      );
      setIsFormValid(!hasErrors);
      return newErrors;
    });
  };

  const validateConfigValue = (type, value) => {
    switch (type) {
      case "url":
        try {
          new URL(value);
          return null;
        } catch {
          return "Invalid URL format.";
        }
      case "host":
        const ipRegex =
          /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        const fqdnRegex =
          /^(?!:\/\/)(?=.{1,255}$)((.{1,63}\.){1,127}(?![0-9]*$)[a-z0-9-]+\.?)$/i;
        if (ipRegex.test(value) || fqdnRegex.test(value)) {
          return null;
        }
        return "Invalid host. Must be a valid IP address or FQDN.";
      case "integer":
        return Number.isInteger(Number(value))
          ? null
          : "Value must be an integer.";
      case "boolean":
        return typeof value === "boolean" ? null : "Value must be a boolean.";
      case "password":
        return value.length >= 6
          ? null
          : "Password must be at least 6 characters.";
      case "email":
        const emailRegex =
          /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
        return emailRegex.test(value) ? null : "Invalid email address.";
      default:
        return null;
    }
  };

  const renderConfigFields = (obj, path = []) =>
    Object.keys(obj).map((key) => {
      const currentPath = [...path, key];
      const entry = obj[key];
      const errorKey = currentPath.join(".");

      // Handle database type conditional visibility for DB config
      if (selectedConfig === "db") {
        const databaseType = config.database_type?.value || "mysql";

        if (key === "sql") {
          if (databaseType === "sqlite") {
            // For SQLite, only show storage field
            const storageEntry = entry.storage;
            if (storageEntry) {
              const storageError = validationErrors["sql.storage"];
              return (
                <div className="form-group" key="sql.storage">
                  <label htmlFor="sql.storage">
                    SQLite Database File Path:
                  </label>
                  <input
                    type="text"
                    className={`form-control ${storageError ? "is-invalid" : ""}`}
                    id="sql.storage"
                    value={storageEntry.value || ""}
                    onChange={(e) =>
                      handleConfigChange(["sql", "storage"], e.target.value)
                    }
                  />
                  <small className="form-text text-muted">
                    {storageEntry.description}
                  </small>
                  {storageError && (
                    <div className="text-danger">{storageError}</div>
                  )}
                </div>
              );
            }
            return null;
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
        "type" in entry &&
        "value" in entry
      ) {
        const { type, value, description, options } = entry;
        const error = validationErrors[errorKey];

        // Special handling for object-type fields - don't render as input
        if (type === "object") {
          // Skip object fields - they should be processed recursively, not rendered as inputs
          return null;
        }

        const renderInput = () => {
          switch (type) {
            case "select":
              return (
                <select
                  className={`form-control ${error ? "is-invalid" : ""}`}
                  id={errorKey}
                  value={value}
                  onChange={(e) =>
                    handleConfigChange(currentPath, e.target.value)
                  }
                >
                  {options &&
                    options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                </select>
              );
            case "boolean":
              return (
                <div className="form-check">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id={errorKey}
                    checked={value}
                    onChange={(e) =>
                      handleConfigChange(currentPath, e.target.checked)
                    }
                  />
                  <label className="form-check-label" htmlFor={errorKey}>
                    {description}
                  </label>
                </div>
              );
            case "password":
              return (
                <div className="input-group">
                  <input
                    type={showPasswords[errorKey] ? "text" : "password"}
                    className="form-control"
                    id={errorKey}
                    value={value}
                    onChange={(e) =>
                      handleConfigChange(currentPath, e.target.value)
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
              );
            case "textarea":
              return (
                <textarea
                  className="form-control"
                  id={errorKey}
                  value={value}
                  onChange={(e) =>
                    handleConfigChange(currentPath, e.target.value)
                  }
                  rows={3}
                />
              );
            case "array":
              const arrayValue = Array.isArray(value)
                ? value.join(",")
                : value || "";
              return (
                <input
                  type="text"
                  className="form-control"
                  id={errorKey}
                  value={arrayValue}
                  onChange={(e) =>
                    handleConfigChange(currentPath, e.target.value.split(","))
                  }
                  placeholder="Comma-separated values"
                />
              );
            default:
              return (
                <input
                  type="text"
                  className="form-control"
                  id={errorKey}
                  value={value}
                  onChange={(e) =>
                    handleConfigChange(currentPath, e.target.value)
                  }
                />
              );
          }
        };

        return (
          <div key={errorKey} className="form-group">
            <label htmlFor={errorKey}>{key}:</label>
            {renderInput()}
            <small className="form-text text-muted">{description}</small>
            {error && <div className="text-danger">{error}</div>}
          </div>
        );
      } else if (typeof entry === "object" && entry !== null) {
        // Special handling for oidc_providers
        if (key === "oidc_providers" && selectedConfig === "auth") {
          return (
            <div key={errorKey} className="col-md-12 mt-3">
              <div className="card">
                <div className="card-header d-flex justify-content-between align-items-center">
                  <h5 className="mb-0">
                    <i className="fas fa-shield-alt me-2" />
                    OIDC Providers
                  </h5>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      resetOidcProviderForm();
                      setShowOidcProviderModal(true);
                    }}
                  >
                    <i className="fas fa-plus me-1" />
                    Add OIDC Provider
                  </button>
                </div>
                <div className="card-body">
                  <p className="text-muted mb-3">
                    Manage OpenID Connect authentication providers for single
                    sign-on integration.
                  </p>

                  {entry.value && Object.keys(entry.value).length > 0 ? (
                    <div className="row">
                      {Object.entries(entry.value).map(
                        ([providerName, providerConfig]) => (
                          <div key={providerName} className="col-md-6 mb-3">
                            <div className="card border-secondary">
                              <div className="card-header">
                                <h6 className="mb-0">
                                  <i className="fab fa-openid me-2" />
                                  {providerConfig.display_name?.value ||
                                    providerName}
                                  {providerConfig.enabled?.value && (
                                    <span className="badge bg-success ms-2">
                                      Enabled
                                    </span>
                                  )}
                                </h6>
                              </div>
                              <div className="card-body">
                                <small className="text-muted">
                                  <strong>Issuer:</strong>{" "}
                                  {providerConfig.issuer?.value}
                                  <br />
                                  <strong>Client ID:</strong>{" "}
                                  {providerConfig.client_id?.value}
                                  <br />
                                  <strong>Scope:</strong>{" "}
                                  {providerConfig.scope?.value}
                                </small>
                              </div>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  ) : (
                    <div className="alert alert-info">
                      <i className="fas fa-info-circle me-2" />
                      No OIDC providers configured yet. Click "Add OIDC
                      Provider" to set up authentication with providers like
                      Google, Microsoft, GitHub, etc.
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        }

        return (
          <div key={errorKey} className="col-md-6 mt-3">
            <h5
              style={{
                borderBottom: "1px solid rgb(204, 204, 204)",
                paddingBottom: "10px",
              }}
            >
              {key}
            </h5>
            <div className="row">{renderConfigFields(entry, currentPath)}</div>
          </div>
        );
      }
      return null;
    });

  const checkOrganizationExists = async (name) => {
    try {
      const response = await OrganizationService.getOrganizationByName(name);
      return !!response.data;
    } catch (error) {
      console.error("Error checking organization existence:", error);
      return false;
    }
  };

  useEffect(() => {
    fetchConfig(selectedConfig);
  }, [selectedConfig]);

  useEffect(() => {
    setRenameMessage("");
  }, [editingOrgId]);

  const resetOidcProviderForm = () => {
    setOidcProviderForm({
      name: "",
      displayName: "",
      issuer: "",
      clientId: "",
      clientSecret: "",
      scope: "openid profile email",
      responseType: "code",
      enabled: true,
    });
  };

  const handleOidcProviderFormChange = (field, value) => {
    setOidcProviderForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const addOidcProvider = async (e) => {
    e.preventDefault();
    const {
      name,
      displayName,
      issuer,
      clientId,
      clientSecret,
      scope,
      responseType,
      enabled,
    } = oidcProviderForm;

    if (!name || !displayName || !issuer || !clientId || !clientSecret) {
      setMessage(
        "Provider name, display name, issuer, client ID, and client secret are required"
      );
      setMessageType("danger");
      return;
    }

    if (!/^[a-z0-9_]+$/i.test(name)) {
      setMessage(
        "Provider name must contain only letters, numbers, and underscores"
      );
      setMessageType("danger");
      return;
    }

    if (config.auth?.oidc_providers?.value?.[name]) {
      setMessage(`OIDC provider '${name}' already exists`);
      setMessageType("danger");
      return;
    }

    try {
      setOidcProviderLoading(true);
      setMessage("Adding OIDC provider...");
      setMessageType("info");

      const newConfig = { ...config };
      if (!newConfig.auth) {
        newConfig.auth = {};
      }
      if (!newConfig.auth.oidc.providers) {
        newConfig.auth.oidc.providers = {
          type: "object",
          description: "Configure OpenID Connect authentication providers",
          value: {},
        };
      }

      newConfig.auth.oidc.providers.value[name] = {
        enabled: {
          type: "boolean",
          value: enabled,
          description: `Enable ${displayName} OIDC authentication`,
        },
        display_name: {
          type: "string",
          value: displayName,
          description: "Display name shown on login button",
        },
        issuer: {
          type: "string",
          value: issuer,
          description: `${displayName} OIDC issuer URL`,
        },
        client_id: {
          type: "string",
          value: clientId,
          description: `${displayName} OAuth Client ID`,
        },
        client_secret: {
          type: "password",
          value: clientSecret,
          description: `${displayName} OAuth Client Secret`,
        },
        scope: {
          type: "string",
          value: scope,
          description: "OAuth scopes to request",
        },
        response_type: {
          type: "select",
          value: responseType,
          options: ["code", "id_token", "code id_token"],
          description: "OAuth 2.0 response type",
        },
        prompt: {
          type: "string",
          value: "",
          description: "Optional prompt parameter",
        },
      };

      await ConfigService.updateConfig("auth", newConfig);
      setConfig(newConfig);
      setMessage(`OIDC provider '${displayName}' added successfully!`);
      setMessageType("success");
      setShowOidcProviderModal(false);
      resetOidcProviderForm();
    } catch (error) {
      console.error("Error adding OIDC provider:", error);
      setMessage(
        `Error adding OIDC provider: ${error.response?.data?.message || error.message}`
      );
      setMessageType("danger");
    } finally {
      setOidcProviderLoading(false);
    }
  };

  const deleteOidcProvider = async (providerName) => {
    if (
      !window.confirm(
        `Are you sure you want to delete the OIDC provider '${providerName}'? This cannot be undone.`
      )
    ) {
      return;
    }

    try {
      setMessage("Deleting OIDC provider...");
      setMessageType("info");

      const newConfig = { ...config };
      if (newConfig.auth?.oidc_providers?.value) {
        delete newConfig.auth.oidc.providers.value[providerName];
      }

      await ConfigService.updateConfig("auth", newConfig);
      setConfig(newConfig);
      setMessage(`OIDC provider '${providerName}' deleted successfully!`);
      setMessageType("success");
    } catch (error) {
      console.error("Error deleting OIDC provider:", error);
      setMessage(
        `Error deleting OIDC provider: ${error.response?.data?.message || error.message}`
      );
      setMessageType("danger");
    }
  };

  return (
    <div className="list row">
      <header>
        <h3 className="text-center">Admin Panel</h3>
      </header>
      <ul className="nav nav-tabs">
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === "organizations" ? "active" : ""}`}
            onClick={() => setActiveTab("organizations")}
          >
            Organizations and Users
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === "config" ? "active" : ""}`}
            onClick={() => setActiveTab("config")}
          >
            Configuration Management
          </button>
        </li>
      </ul>
      <div className="tab-content mt-2">
        {message && (
          <div className={`alert alert-${messageType}`} role="alert">
            {message}
          </div>
        )}
        {activeTab === "organizations" && (
          <div className="row">
            {organizations.map((org) => (
              <div className="col-md-6" key={org.id}>
                <div className="card mt-4">
                  <div className="card-header d-flex justify-content-between align-items-center">
                    {editingOrgId === org.id ? (
                      <form onSubmit={handleRenameOrganization} noValidate>
                        {renameMessage && (
                          <div className="alert alert-info mt-3 mb-3">
                            {renameMessage}
                          </div>
                        )}
                        <input
                          type="text"
                          className="form-control"
                          value={newOrgName}
                          onChange={(e) => setNewOrgName(e.target.value)}
                        />
                        <button
                          className="btn btn-success btn-sm mt-2"
                          type="submit"
                        >
                          Save
                        </button>
                        <button
                          className="btn btn-secondary btn-sm mt-2 ms-2"
                          onClick={() => setEditingOrgId(null)}
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <Link to={`/${org.name}`} className="card-title">
                        {org.name}
                      </Link>
                    )}
                    <div>
                      <button
                        className="btn btn-primary btn-sm me-2"
                        onClick={() => {
                          setEditingOrgId(org.id);
                          setNewOrgName(org.name);
                          setOldName(org.name);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        className={`btn btn-${org.suspended ? "success" : "warning"} btn-sm me-2`}
                        onClick={() =>
                          handleSuspendOrResumeOrganization(
                            org.name,
                            org.suspended
                          )
                        }
                      >
                        {org.suspended ? "Resume" : "Suspend"}
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() =>
                          handleDeleteClick({
                            type: "organization",
                            name: org.name,
                          })
                        }
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="card-body">
                    <p>Total Boxes: {org.totalBoxes}</p>
                  </div>
                  <ul className="list-group list-group-flush">
                    {org.users.map((user) => (
                      <li
                        className="list-group-item d-flex justify-content-between align-items-center"
                        key={user.id}
                      >
                        <div>
                          <strong>{user.username}</strong> <br />
                          <small>{user.email}</small> <br />
                          <small>Boxes: {user.totalBoxes}</small> <br />
                          <small>Roles:</small>
                          <ul>
                            {user.roles &&
                              user.roles.map((role, index) => (
                                <li key={index}>{role.name}</li>
                              ))}
                          </ul>
                        </div>
                        <div>
                          {user.roles &&
                            !user.roles.some((role) => role.name === "admin") &&
                            (user.roles.some(
                              (role) => role.name === "moderator"
                            ) ? (
                              <button
                                className="btn btn-secondary btn-sm me-2"
                                onClick={() => handleDemoteUser(user.id)}
                              >
                                Demote
                              </button>
                            ) : (
                              <button
                                className="btn btn-primary btn-sm me-2"
                                onClick={() => handlePromoteUser(user.id)}
                              >
                                Promote
                              </button>
                            ))}
                          <button
                            className={`btn btn-${user.suspended ? "success" : "warning"} btn-sm me-2`}
                            onClick={() =>
                              handleSuspendOrResumeUser(user.id, user.suspended)
                            }
                          >
                            {user.suspended ? "Resume" : "Suspend"}
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() =>
                              handleDeleteClick({ type: "user", id: user.id })
                            }
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        )}
        {activeTab === "config" && (
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
                      .catch((error) => {
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
              <div>
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
                            {section.fields.map((field) => (
                              <div
                                key={field.path}
                                className={
                                  field.type === "textarea" ||
                                  field.type === "array"
                                    ? "col-12"
                                    : "col-md-6"
                                }
                              >
                                {renderField(field)}
                              </div>
                            ))}
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

                        if (subsectionName === "OIDC Providers") {
                          return (
                            <div key={subsectionName} className="card mb-4">
                              <div
                                className="card-header d-flex justify-content-between align-items-center"
                                style={{ cursor: "pointer" }}
                                onClick={() =>
                                  toggleSubsection(sectionName, subsectionName)
                                }
                              >
                                <h6 className="mb-0">
                                  <i
                                    className={`fas ${isCollapsed ? "fa-chevron-right" : "fa-chevron-down"} me-2`}
                                  />
                                  <i className="fas fa-shield-alt me-2" />
                                  OIDC Providers
                                  <span className="badge bg-light text-dark ms-2">
                                    {config.auth?.oidc?.providers
                                      ? Object.keys(config.auth.oidc.providers)
                                          .length
                                      : 0}{" "}
                                    provider
                                    {Object.keys(
                                      config.auth?.oidc?.providers || {}
                                    ).length !== 1
                                      ? "s"
                                      : ""}
                                  </span>
                                </h6>
                                <button
                                  className="btn btn-primary btn-sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingProvider(null);
                                    resetOidcProviderForm();
                                    setShowOidcProviderModal(true);
                                  }}
                                >
                                  <i className="fas fa-plus me-1" />
                                  Add OIDC Provider
                                </button>
                              </div>
                              {!isCollapsed && (
                                <div className="card-body">
                                  <p className="text-muted mb-3">
                                    Manage OpenID Connect authentication
                                    providers for single sign-on integration.
                                    Click on a provider card to edit its
                                    settings.
                                  </p>

                                  {config.auth?.oidc?.providers &&
                                  Object.keys(config.auth.oidc.providers)
                                    .length > 0 ? (
                                    <div className="row">
                                      {Object.entries(
                                        config.auth.oidc.providers
                                      ).map(
                                        ([providerName, providerConfig]) => (
                                          <div
                                            key={providerName}
                                            className="col-md-6 mb-3"
                                          >
                                            <div
                                              className="card border-secondary"
                                              style={{ cursor: "pointer" }}
                                              onClick={() => {
                                                setEditingProvider(
                                                  providerName
                                                );
                                                setOidcProviderForm({
                                                  name: providerName,
                                                  displayName:
                                                    providerConfig.display_name
                                                      ?.value || "",
                                                  issuer:
                                                    providerConfig.issuer
                                                      ?.value || "",
                                                  clientId:
                                                    providerConfig.client_id
                                                      ?.value || "",
                                                  clientSecret:
                                                    providerConfig.client_secret
                                                      ?.value || "",
                                                  scope:
                                                    providerConfig.scope
                                                      ?.value ||
                                                    "openid profile email",
                                                  responseType:
                                                    providerConfig.response_type
                                                      ?.value || "code",
                                                  enabled:
                                                    providerConfig.enabled
                                                      ?.value !== undefined
                                                      ? providerConfig.enabled
                                                          .value
                                                      : false,
                                                });
                                                setShowOidcProviderModal(true);
                                              }}
                                            >
                                              <div className="card-header">
                                                <h6 className="mb-0">
                                                  <i className="fab fa-openid me-2" />
                                                  {providerConfig.display_name
                                                    ?.value || providerName}
                                                  {providerConfig.enabled
                                                    ?.value && (
                                                    <span className="badge bg-success ms-2">
                                                      Enabled
                                                    </span>
                                                  )}
                                                </h6>
                                              </div>
                                              <div className="card-body">
                                                <small className="text-muted">
                                                  <strong>Issuer:</strong>{" "}
                                                  {providerConfig.issuer?.value}
                                                  <br />
                                                  <strong>
                                                    Client ID:
                                                  </strong>{" "}
                                                  {
                                                    providerConfig.client_id
                                                      ?.value
                                                  }
                                                  <br />
                                                  <strong>Scope:</strong>{" "}
                                                  {providerConfig.scope?.value}
                                                </small>
                                              </div>
                                            </div>
                                          </div>
                                        )
                                      )}
                                    </div>
                                  ) : (
                                    <div className="alert alert-info">
                                      <i className="fas fa-info-circle me-2" />
                                      No OIDC providers configured yet. Click
                                      "Add OIDC Provider" to set up
                                      authentication with providers like Google,
                                      Microsoft, GitHub, etc.
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        }

                        return (
                          <div key={subsectionName} className="card mb-4">
                            <div
                              className="card-header"
                              style={{ cursor: "pointer" }}
                              onClick={() =>
                                toggleSubsection(sectionName, subsectionName)
                              }
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
                                  {subsection.fields.map((field) => (
                                    <div
                                      key={field.path}
                                      className={
                                        field.type === "textarea" ||
                                        field.type === "array"
                                          ? "col-12"
                                          : "col-md-6"
                                      }
                                    >
                                      {renderField(field)}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      <ConfirmationModal
        show={showDeleteModal}
        handleClose={handleCloseDeleteModal}
        handleConfirm={handleConfirmDelete}
      />

      {/* Add OIDC Provider Modal */}
      {showOidcProviderModal && (
        <div
          className="modal show d-block"
          tabIndex="-1"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="fab fa-openid me-2" />
                  {editingProvider ? "Edit OIDC Provider" : "Add OIDC Provider"}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowOidcProviderModal(false)}
                />
              </div>
              <form onSubmit={addOidcProvider}>
                <div className="modal-body">
                  <p className="text-muted mb-4">
                    Configure a new OpenID Connect authentication provider.
                    You'll need to register your application with the provider
                    first to get the client ID and client secret.
                  </p>

                  <div className="row">
                    <div className="col-md-6">
                      <div className="form-group mb-3">
                        <label htmlFor="providerName">
                          Provider Name <span className="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-control"
                          id="providerName"
                          placeholder="e.g., mycompany, enterprise, provider1"
                          value={oidcProviderForm.name}
                          onChange={(e) =>
                            handleOidcProviderFormChange(
                              "name",
                              e.target.value.toLowerCase()
                            )
                          }
                          disabled={oidcProviderLoading}
                          required
                        />
                        <small className="form-text text-muted">
                          Internal identifier (lowercase, letters, numbers, and
                          underscores only)
                        </small>
                      </div>
                    </div>

                    <div className="col-md-6">
                      <div className="form-group mb-3">
                        <label htmlFor="displayName">
                          Display Name <span className="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-control"
                          id="displayName"
                          placeholder="e.g., Sign in with Company SSO"
                          value={oidcProviderForm.displayName}
                          onChange={(e) =>
                            handleOidcProviderFormChange(
                              "displayName",
                              e.target.value
                            )
                          }
                          disabled={oidcProviderLoading}
                          required
                        />
                        <small className="form-text text-muted">
                          Name shown to users on the login page
                        </small>
                      </div>
                    </div>

                    <div className="col-md-12">
                      <div className="form-group mb-3">
                        <label htmlFor="issuer">
                          Issuer URL <span className="text-danger">*</span>
                        </label>
                        <input
                          type="url"
                          className="form-control"
                          id="issuer"
                          placeholder="https://your-provider.com or https://your-domain.auth0.com"
                          value={oidcProviderForm.issuer}
                          onChange={(e) =>
                            handleOidcProviderFormChange(
                              "issuer",
                              e.target.value
                            )
                          }
                          disabled={oidcProviderLoading}
                          required
                        />
                        <small className="form-text text-muted">
                          The OIDC issuer URL (check your provider's
                          documentation for the correct URL)
                        </small>
                      </div>
                    </div>

                    <div className="col-md-6">
                      <div className="form-group mb-3">
                        <label htmlFor="clientId">
                          Client ID <span className="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-control"
                          id="clientId"
                          placeholder="Your OAuth client ID"
                          value={oidcProviderForm.clientId}
                          onChange={(e) =>
                            handleOidcProviderFormChange(
                              "clientId",
                              e.target.value
                            )
                          }
                          disabled={oidcProviderLoading}
                          required
                        />
                        <small className="form-text text-muted">
                          Client ID from your OAuth application registration
                        </small>
                      </div>
                    </div>

                    <div className="col-md-6">
                      <div className="form-group mb-3">
                        <label htmlFor="clientSecret">
                          Client Secret <span className="text-danger">*</span>
                        </label>
                        <input
                          type="password"
                          className="form-control"
                          id="clientSecret"
                          placeholder="Your OAuth client secret"
                          value={oidcProviderForm.clientSecret}
                          onChange={(e) =>
                            handleOidcProviderFormChange(
                              "clientSecret",
                              e.target.value
                            )
                          }
                          disabled={oidcProviderLoading}
                          required
                        />
                        <small className="form-text text-muted">
                          Client secret from your OAuth application registration
                        </small>
                      </div>
                    </div>

                    <div className="col-md-6">
                      <div className="form-group mb-3">
                        <label htmlFor="scope">Scope</label>
                        <input
                          type="text"
                          className="form-control"
                          id="scope"
                          value={oidcProviderForm.scope}
                          onChange={(e) =>
                            handleOidcProviderFormChange(
                              "scope",
                              e.target.value
                            )
                          }
                          disabled={oidcProviderLoading}
                        />
                        <small className="form-text text-muted">
                          OAuth scopes (space-separated). Default is usually
                          sufficient.
                        </small>
                      </div>
                    </div>

                    <div className="col-md-6">
                      <div className="form-group mb-3">
                        <label htmlFor="responseType">Response Type</label>
                        <select
                          className="form-control"
                          id="responseType"
                          value={oidcProviderForm.responseType}
                          onChange={(e) =>
                            handleOidcProviderFormChange(
                              "responseType",
                              e.target.value
                            )
                          }
                          disabled={oidcProviderLoading}
                        >
                          <option value="code">
                            Authorization Code (Recommended)
                          </option>
                          <option value="id_token">ID Token</option>
                          <option value="code id_token">Code + ID Token</option>
                        </select>
                        <small className="form-text text-muted">
                          OAuth flow type. Use "code" for most providers.
                        </small>
                      </div>
                    </div>

                    <div className="col-md-12">
                      <div className="form-check">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          id="enabled"
                          checked={oidcProviderForm.enabled}
                          onChange={(e) =>
                            handleOidcProviderFormChange(
                              "enabled",
                              e.target.checked
                            )
                          }
                          disabled={oidcProviderLoading}
                        />
                        <label className="form-check-label" htmlFor="enabled">
                          Enable this provider for user authentication
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="alert alert-info mt-3">
                    <h6>Configuration Instructions</h6>
                    <ol className="mb-0">
                      <li>
                        Register your application with your OIDC provider's
                        developer console
                      </li>
                      <li>
                        Add{" "}
                        <code>
                          https://your-domain.com/api/auth/oidc/callback
                        </code>{" "}
                        as an allowed redirect URI
                      </li>
                      <li>
                        Copy the Client ID and Client Secret from your
                        provider's console
                      </li>
                      <li>
                        Find your provider's issuer URL in their documentation
                      </li>
                      <li>
                        Fill out the form above and test the configuration
                      </li>
                    </ol>
                  </div>
                </div>
                <div className="modal-footer">
                  {editingProvider && (
                    <button
                      type="button"
                      className="btn btn-danger me-auto"
                      onClick={() => {
                        setShowOidcProviderModal(false);
                        deleteOidcProvider(editingProvider);
                      }}
                      disabled={oidcProviderLoading}
                    >
                      <i className="fas fa-trash me-1" />
                      Delete Provider
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowOidcProviderModal(false)}
                    disabled={oidcProviderLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={oidcProviderLoading}
                  >
                    {oidcProviderLoading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" />
                        {editingProvider ? "Updating..." : "Adding..."}
                      </>
                    ) : editingProvider ? (
                      "Update Provider"
                    ) : (
                      "Add Provider"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;
