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
export const getSectionIcon = (sectionKey) => {
  const iconMap = {
    authentication: "fas fa-shield-alt",
    database: "fas fa-database",
    mail: "fas fa-envelope",
    application: "fas fa-cogs",
  };
  return iconMap[sectionKey] || "fas fa-cog";
};

/**
 * Infer section name from configuration path
 * @param {string} path - Configuration path
 * @param {string} configType - Type of config
 * @returns {string} Section name
 */
export const inferSectionKey = (path, configType) => {
  const sectionMaps = {
    auth: {
      auth: "authentication",
      jwt: "authentication",
      local: "authentication",
      external: "authentication",
      oidc: "authentication",
      oidc_providers: "authentication",
    },
    app: {
      boxvault: "application",
      gravatar: "application",
      ssl: "application",
    },
    db: {
      sql: "database",
      mysql_pool: "database",
      database_type: "database",
    },
    mail: {
      smtp_connect: "mail",
      smtp_settings: "mail",
      smtp_auth: "mail",
    },
  };

  const sectionMap = sectionMaps[configType] || {};
  const pathParts = path.split(".");
  return (
    sectionMap[pathParts[0]] ||
    sectionMap[pathParts[1]] ||
    configType ||
    "general"
  );
};

/**
 * Infer subsection name from configuration path
 * @param {string} path - Configuration path
 * @param {string} sectionKey - Section key
 * @returns {string|null} Subsection name or null
 */
export const inferSubsectionKey = () =>
  // We now rely on the 'subsection' field provided by the backend config
  null;

/**
 * Normalize subsection key to match translation keys
 * @param {string} key - Raw subsection key (e.g. "BoxVault Settings")
 * @returns {string} Normalized key (e.g. "boxvaultSettings")
 */
const normalizeSubsectionKey = (key) => {
  if (!key) {
    return key;
  }

  return key
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]+(?<chr>.)?/g, ([, chr]) =>
      chr ? chr.toUpperCase() : ""
    );
};

/**
 * Initialize section structure if it doesn't exist
 */
const initializeSection = (organizedSections, sectionKey) => {
  if (!organizedSections[sectionKey]) {
    organizedSections[sectionKey] = {
      key: sectionKey,
      icon: getSectionIcon(sectionKey),
      description: "",
      fields: [],
      subsections: {},
    };
  }
};

/**
 * Initialize subsection structure if it doesn't exist
 */
const initializeSubsection = (organizedSections, sectionKey, subsectionKey) => {
  if (
    subsectionKey &&
    !organizedSections[sectionKey].subsections[subsectionKey]
  ) {
    organizedSections[sectionKey].subsections[subsectionKey] = {
      key: subsectionKey,
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
  upload: value.upload || false,
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

  const sectionKey =
    value.section || inferSectionKey(fullPath, configType) || sectionName;
  const subsectionKey =
    value.subsection_key || normalizeSubsectionKey(value.subsection);

  initializeSection(organizedSections, sectionKey);

  const fieldData = createFieldData(key, fullPath, value);

  if (
    value.type === "object" &&
    value.value &&
    typeof value.value === "object"
  ) {
    initializeSubsection(organizedSections, sectionKey, subsectionKey);
    processObject(value.value, fullPath, sectionKey);
  } else if (subsectionKey) {
    initializeSubsection(organizedSections, sectionKey, subsectionKey);
    organizedSections[sectionKey].subsections[subsectionKey].fields.push(
      fieldData
    );
  } else {
    organizedSections[sectionKey].fields.push(fieldData);
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
  const sectionKey =
    value.section || inferSectionKey(fullPath, configType) || sectionName;
  const subsectionKey =
    value.subsection_key || normalizeSubsectionKey(value.subsection);

  initializeSection(organizedSections, sectionKey);
  initializeSubsection(organizedSections, sectionKey, subsectionKey);

  // Process the providers
  processObject(value.providers, `${fullPath}.providers`, sectionKey);
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

  const processObject = (obj, path = "", sectionName = "general") => {
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
          inferSectionKey(fullPath, configType) || sectionName;
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
 * @param {Function} t - Translation function
 * @returns {string|null} Error message or null if valid
 */
export const validateConfigValue = (type, value, t) => {
  switch (type) {
    case "url": {
      try {
        new URL(value);
        return null;
      } catch {
        return t("validation.invalidUrl");
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
      return t("validation.invalidHost");
    }
    case "integer":
      return Number.isInteger(Number(value))
        ? null
        : t("validation.integerRequired");
    case "boolean":
      return typeof value === "boolean"
        ? null
        : t("validation.booleanRequired");
    case "password":
      return value.length >= 6 ? null : t("validation.passwordLength");
    case "email": {
      const emailRegex =
        /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
      return emailRegex.test(value) ? null : t("validation.invalidEmail");
    }
    default:
      return null;
  }
};

/**
 * Validate organization name format
 * @param {string} orgName - Organization name to validate
 * @returns {boolean} True if valid, false otherwise
 */
export const validateOrgName = (orgName) => {
  const validCharsRegex = /^[0-9a-zA-Z-._]+$/;
  return orgName && validCharsRegex.test(orgName);
};
