/**
 * Configuration Processing Utilities
 * Pure functions for processing and validating configuration data
 */

/**
 * Generate human-readable label from field name
 * @param {string} fieldName - Field name (e.g., "smtp_host")
 * @returns {string} Formatted label (e.g., "Smtp Host")
 */
export const generateLabel = (fieldName) => {
  if (!fieldName || typeof fieldName !== "string") {
    return fieldName || "";
  }
  return fieldName
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

/**
 * Get icon class for section
 * @param {string} section - Section name
 * @returns {string} Icon class name
 */
export const getSectionIcon = (section) => {
  const iconMap = {
    Authentication: "fas fa-shield-alt",
    Database: "fas fa-database",
    Mail: "fas fa-envelope",
    Application: "fas fa-cogs",
  };
  return iconMap[section] || "fas fa-cog";
};

/**
 * Infer section name from configuration path
 * @param {string} path - Configuration path
 * @param {string} configType - Type of config
 * @returns {string} Section name
 */
export const inferSection = (path, configType) => {
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

/**
 * Infer subsection name from configuration path
 * @param {string} path - Configuration path
 * @param {string} section - Section name
 * @returns {string|null} Subsection name or null
 */
export const inferSubsection = (path, section) => {
  const pathParts = path.split(".");

  if (section === "Authentication") {
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
  }

  if (section === "Application") {
    if (pathParts.includes("boxvault")) {
      return "BoxVault Settings";
    }
    if (pathParts.includes("gravatar")) {
      return "Gravatar Settings";
    }
    if (pathParts.includes("ssl")) {
      return "SSL Settings";
    }
  }

  if (section === "Database") {
    if (pathParts.includes("sql")) {
      return "Database Connection";
    }
    if (pathParts.includes("mysql_pool")) {
      return "Connection Pool";
    }
  }

  if (section === "Mail") {
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

/**
 * Initialize section structure if it doesn't exist
 */
const initializeSection = (organizedSections, section) => {
  if (!organizedSections[section]) {
    organizedSections[section] = {
      title: section,
      icon: getSectionIcon(section),
      description: "",
      fields: [],
      subsections: {},
    };
  }
};

/**
 * Initialize subsection structure if it doesn't exist
 */
const initializeSubsection = (organizedSections, section, subsection) => {
  if (subsection && !organizedSections[section].subsections[subsection]) {
    organizedSections[section].subsections[subsection] = {
      title: subsection,
      fields: [],
    };
  }
};

/**
 * Create field data object
 */
const createFieldData = (key, fullPath, value) => ({
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
});

/**
 * Process a configuration value with type and value properties
 */
const processConfigValue = (options) => {
  const {
    key,
    value,
    fullPath,
    configType,
    sectionName,
    extractedValues,
    organizedSections,
    processObject,
  } = options;

  extractedValues[fullPath] = value.value;

  const section =
    value.section || inferSection(fullPath, configType) || sectionName;
  const subsection =
    value.subsection || inferSubsection(fullPath, section, configType);

  initializeSection(organizedSections, section);

  const fieldData = createFieldData(key, fullPath, value);

  if (
    value.type === "object" &&
    value.value &&
    typeof value.value === "object"
  ) {
    initializeSubsection(organizedSections, section, subsection);
    processObject(value.value, fullPath, section);
  } else if (subsection) {
    initializeSubsection(organizedSections, section, subsection);
    organizedSections[section].subsections[subsection].fields.push(fieldData);
  } else {
    organizedSections[section].fields.push(fieldData);
  }
};

/**
 * Process a configuration object with providers property
 */
const processProvidersObject = (
  value,
  fullPath,
  configType,
  sectionName,
  organizedSections,
  processObject
) => {
  const section =
    value.section || inferSection(fullPath, configType) || sectionName;
  const subsection =
    value.subsection || inferSubsection(fullPath, section, configType);

  initializeSection(organizedSections, section);
  initializeSubsection(organizedSections, section, subsection);

  // Process the providers
  processObject(value.providers, `${fullPath}.providers`, section);
};

/**
 * Process configuration object into organized sections
 * @param {Object} configData - Raw configuration data
 * @param {string} configType - Type of config (app, auth, db, mail)
 * @returns {Object} { extractedValues, organizedSections }
 */
export const processConfig = (configData, configType) => {
  const extractedValues = {};
  const organizedSections = {};

  const processObject = (obj, path = "", sectionName = "General") => {
    for (const [key, value] of Object.entries(obj || {})) {
      const fullPath = path ? `${path}.${key}` : key;

      const hasTypeAndValue =
        value &&
        typeof value === "object" &&
        value.type &&
        Object.hasOwn(value, "value");

      const hasTypeAndProviders =
        value &&
        typeof value === "object" &&
        value.type &&
        Object.hasOwn(value, "providers");

      const isPlainObject =
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        !Object.hasOwn(value, "type");

      if (hasTypeAndValue) {
        processConfigValue({
          key,
          value,
          fullPath,
          configType,
          sectionName,
          extractedValues,
          organizedSections,
          processObject,
        });
      } else if (hasTypeAndProviders) {
        processProvidersObject(
          value,
          fullPath,
          configType,
          sectionName,
          organizedSections,
          processObject
        );
      } else if (isPlainObject) {
        const inferredSection =
          inferSection(fullPath, configType) || sectionName;
        processObject(value, fullPath, inferredSection);
      }
    }
  };

  processObject(configData);

  // Sort fields by order
  Object.values(organizedSections).forEach((section) => {
    section.fields.sort((a, b) => (a.order || 0) - (b.order || 0));
    Object.values(section.subsections).forEach((subsection) => {
      subsection.fields.sort((a, b) => (a.order || 0) - (b.order || 0));
    });
  });

  return { extractedValues, organizedSections };
};

/**
 * Validate configuration value based on type
 * @param {string} type - Field type
 * @param {*} value - Value to validate
 * @returns {string|null} Error message or null if valid
 */
export const validateConfigValue = (type, value) => {
  switch (type) {
    case "url": {
      try {
        new URL(value);
        return null;
      } catch {
        return "Invalid URL format.";
      }
    }
    case "host": {
      const ipRegex =
        /^(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      const fqdnRegex =
        /^(?!:\/\/)(?=.{1,255}$)(?:(?:.{1,63}\.){1,127}(?![0-9]*$)[a-z0-9-]+\.?)$/i;
      if (ipRegex.test(value) || fqdnRegex.test(value)) {
        return null;
      }
      return "Invalid host. Must be a valid IP address or FQDN.";
    }
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
    case "email": {
      const emailRegex =
        /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
      return emailRegex.test(value) ? null : "Invalid email address.";
    }
    default:
      return null;
  }
};

/**
 * Validate organization name format
 * @param {string} orgName - Organization name to validate
 * @returns {string|null} Error message or null if valid
 */
export const validateOrgName = (orgName) => {
  const validCharsRegex = /^[0-9a-zA-Z-._]+$/;
  if (!orgName || !validCharsRegex.test(orgName)) {
    return "Invalid organization name. Only alphanumeric characters, hyphens, underscores, and periods are allowed.";
  }
  return null;
};
