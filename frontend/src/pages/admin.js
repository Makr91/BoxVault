import PropTypes from 'prop-types';

/**
 * The app's side of the shared admin page: the organizations with their
 * members and the suspend, resume, rename, edit and delete calls over
 * them, the configuration files with restart, SMTP test and SSL upload,
 * the storage usage and the update check.
 */
export const adminShape = PropTypes.shape({
  organizationsWithUsers: PropTypes.func.isRequired,
  organization: PropTypes.func.isRequired,
  updateOrganization: PropTypes.func.isRequired,
  accessMode: PropTypes.func.isRequired,
  suspendOrganization: PropTypes.func.isRequired,
  resumeOrganization: PropTypes.func.isRequired,
  removeOrganization: PropTypes.func.isRequired,
  removeMember: PropTypes.func.isRequired,
  removeUser: PropTypes.func.isRequired,
  suspendUser: PropTypes.func.isRequired,
  resumeUser: PropTypes.func.isRequired,
  gravatarProfile: PropTypes.func.isRequired,
  config: PropTypes.shape({
    get: PropTypes.func.isRequired,
    update: PropTypes.func.isRequired,
    restart: PropTypes.func.isRequired,
    testSmtp: PropTypes.func.isRequired,
    uploadSsl: PropTypes.func.isRequired,
  }).isRequired,
  storage: PropTypes.func.isRequired,
  updateStatus: PropTypes.func.isRequired,
});

export const CONFIG_NAMES = ['app', 'auth', 'db', 'mail'];

const SECTION_MAPS = {
  auth: {
    auth: 'authentication',
    jwt: 'authentication',
    local: 'authentication',
    external: 'authentication',
    oidc: 'authentication',
    oidc_providers: 'authentication',
  },
  app: {
    boxvault: 'application',
    gravatar: 'application',
    ssl: 'application',
  },
  db: {
    sql: 'database',
    mysql_pool: 'database',
    database_type: 'database',
  },
  mail: {
    smtp_connect: 'mail',
    smtp_settings: 'mail',
    smtp_auth: 'mail',
  },
};

export const generateLabel = fieldName => {
  if (!fieldName || typeof fieldName !== 'string') {
    return fieldName || '';
  }
  return fieldName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export const inferSectionKey = (path, configType) => {
  const sectionMap = SECTION_MAPS[configType] || {};
  const pathParts = path.split('.');
  return sectionMap[pathParts[0]] || sectionMap[pathParts[1]] || configType || 'general';
};

const normalizeSubsectionKey = key => {
  if (!key) {
    return key;
  }
  return key
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]+(?<chr>.)?/g, ([, chr]) => (chr ? chr.toUpperCase() : ''));
};

const initializeSection = (organizedSections, sectionKey) => {
  if (!organizedSections[sectionKey]) {
    organizedSections[sectionKey] = {
      key: sectionKey,
      description: '',
      fields: [],
      subsections: {},
    };
  }
};

const initializeSubsection = (organizedSections, sectionKey, subsectionKey) => {
  if (subsectionKey && !organizedSections[sectionKey].subsections[subsectionKey]) {
    organizedSections[sectionKey].subsections[subsectionKey] = {
      key: subsectionKey,
      fields: [],
    };
  }
};

const createFieldData = (key, fullPath, value) => ({
  key: fullPath,
  path: fullPath,
  type: value.type,
  label: generateLabel(key),
  description: value.description || '',
  placeholder: value.placeholder || '',
  required: value.required || false,
  options: value.options || null,
  order: value.order || 0,
  value: value.value,
  upload: value.upload || false,
});

const processConfigValue = options => {
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

  const sectionKey = value.section || inferSectionKey(fullPath, configType) || sectionName;
  const subsectionKey = value.subsection_key || normalizeSubsectionKey(value.subsection);

  initializeSection(organizedSections, sectionKey);

  const fieldData = createFieldData(key, fullPath, value);

  if (value.type === 'object' && value.value && typeof value.value === 'object') {
    initializeSubsection(organizedSections, sectionKey, subsectionKey);
    processObject(value.value, fullPath, sectionKey);
  } else if (subsectionKey) {
    initializeSubsection(organizedSections, sectionKey, subsectionKey);
    organizedSections[sectionKey].subsections[subsectionKey].fields.push(fieldData);
  } else {
    organizedSections[sectionKey].fields.push(fieldData);
  }
};

const processProvidersObject = (
  value,
  fullPath,
  configType,
  sectionName,
  organizedSections,
  processObject
) => {
  const sectionKey = value.section || inferSectionKey(fullPath, configType) || sectionName;
  const subsectionKey = value.subsection_key || normalizeSubsectionKey(value.subsection);

  initializeSection(organizedSections, sectionKey);
  initializeSubsection(organizedSections, sectionKey, subsectionKey);

  processObject(value.providers, `${fullPath}.providers`, sectionKey);
};

/**
 * Walk one configuration file's tree into the values keyed by dotted path
 * and the sections, each with its fields and subsections, that the admin
 * page draws.
 * @param {Object} configData - The configuration tree the backend answers
 * @param {string} configType - `app`, `auth`, `db` or `mail`
 * @returns {{ extractedValues: Object, organizedSections: Object }}
 */
export const processConfig = (configData, configType) => {
  const extractedValues = {};
  const organizedSections = {};

  const processObject = (obj, path = '', sectionName = 'general') => {
    for (const [key, value] of Object.entries(obj || {})) {
      const fullPath = path ? `${path}.${key}` : key;

      const hasTypeAndValue =
        value && typeof value === 'object' && value.type && Object.hasOwn(value, 'value');

      const hasTypeAndProviders =
        value && typeof value === 'object' && value.type && Object.hasOwn(value, 'providers');

      const isPlainObject =
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        !Object.hasOwn(value, 'type');

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
        const inferredSection = inferSectionKey(fullPath, configType) || sectionName;
        processObject(value, fullPath, inferredSection);
      }
    }
  };

  processObject(configData);

  Object.values(organizedSections).forEach(section => {
    section.fields.sort((a, b) => (a.order || 0) - (b.order || 0));
    Object.values(section.subsections).forEach(subsection => {
      subsection.fields.sort((a, b) => (a.order || 0) - (b.order || 0));
    });
  });

  return { extractedValues, organizedSections };
};

const IP_PATTERN =
  /^(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const FQDN_PATTERN = /^(?!:\/\/)(?=.{1,255}$)(?:(?:.{1,63}\.){1,127}(?![0-9]*$)[a-z0-9-]+\.?)$/i;
const EMAIL_PATTERN = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;

const validateUrl = (value, t) => {
  try {
    new URL(value);
    return null;
  } catch {
    return t('setup.validation.invalidUrl');
  }
};

const validateHost = (value, t) => {
  if (value === 'localhost' || value === '127.0.0.1') {
    return null;
  }
  return IP_PATTERN.test(value) || FQDN_PATTERN.test(value)
    ? null
    : t('setup.validation.invalidHost');
};

const TYPE_VALIDATORS = {
  url: validateUrl,
  host: validateHost,
  integer: (value, t) =>
    Number.isInteger(Number(value)) ? null : t('setup.validation.integerRequired'),
  boolean: (value, t) =>
    typeof value === 'boolean' ? null : t('setup.validation.booleanRequired'),
  password: (value, t) => (value.length >= 6 ? null : t('setup.validation.passwordLength')),
  email: (value, t) => (EMAIL_PATTERN.test(value) ? null : t('setup.validation.invalidEmail')),
  port: (value, t) => {
    const port = Number(value);
    return port >= 1 && port <= 65535 ? null : t('setup.validation.portRange');
  },
  string: (value, t) => (value.trim() !== '' ? null : t('setup.validation.valueRequired')),
};

/**
 * Validate one configuration value by its declared type.
 * @param {string} type - The field type
 * @param {*} value - The value to check
 * @param {Function} t - The translator for the message
 * @returns {string|null} The message, or null when valid
 */
export const validateConfigValue = (type, value, t) => {
  const validator = TYPE_VALIDATORS[type];
  return validator ? validator(value, t) : null;
};
