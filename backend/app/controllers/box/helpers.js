// helpers.js — shared validation for the optional box content fields pushed by
// the publish pipeline (shortDescription, readme, metadata).

// Whitelisted top-level keys of the structured box facts; unknown keys are
// stripped silently, whitelisted values pass through as given.
const BOX_METADATA_KEYS = [
  'distro',
  'distro_version',
  'os_name',
  'vm_type',
  'desktop',
  'username',
  'password',
  'communicator',
  'cpus',
  'memory_mb',
  'disks',
  'cdroms',
  'providers',
  'built',
  'core_provisioner_version',
  'driver_version',
];

const SHORT_DESCRIPTION_MAX_LENGTH = 255;

/**
 * Sanitize the pipeline-pushed box facts.
 * @param {*} metadata - Raw metadata value from the request body
 * @returns {Object|null} Sanitized copy, or null when not a plain object
 */
const sanitizeBoxMetadata = metadata => {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    return null;
  }
  const sanitized = {};
  for (const key of BOX_METADATA_KEYS) {
    if (Object.hasOwn(metadata, key)) {
      sanitized[key] = metadata[key];
    }
  }
  return sanitized;
};

/**
 * Validate and collect the optional box content fields shared by box create
 * and update. Only keys present in the body land in fields, so update can
 * treat absence as "unchanged" and create can default the rest to null.
 * Wire names are camelCase, matching the box object idiom (isPublic).
 * @param {Object} body - Request body
 * @returns {{errors: Array<{pointer: string, rule: string, params: Object}>, fields: Object}} Failing rules, or collected fields
 */
const parseBoxContentFields = body => {
  const fields = {};
  const { shortDescription, readme, metadata } = body;

  if (typeof shortDescription !== 'undefined') {
    if (shortDescription !== null && typeof shortDescription !== 'string') {
      return {
        errors: [{ pointer: '/shortDescription', rule: 'type', params: { type: 'string' } }],
        fields,
      };
    }
    if (shortDescription !== null && shortDescription.length > SHORT_DESCRIPTION_MAX_LENGTH) {
      return {
        errors: [
          {
            pointer: '/shortDescription',
            rule: 'maxLength',
            params: { maxLength: SHORT_DESCRIPTION_MAX_LENGTH },
          },
        ],
        fields,
      };
    }
    fields.shortDescription = shortDescription;
  }

  if (typeof readme !== 'undefined') {
    if (readme !== null && typeof readme !== 'string') {
      return { errors: [{ pointer: '/readme', rule: 'type', params: { type: 'string' } }], fields };
    }
    fields.readme = readme;
  }

  if (typeof metadata !== 'undefined') {
    if (metadata === null) {
      fields.metadata = null;
    } else {
      const sanitized = sanitizeBoxMetadata(metadata);
      if (!sanitized) {
        return {
          errors: [{ pointer: '/metadata', rule: 'type', params: { type: 'object' } }],
          fields,
        };
      }
      fields.metadata = sanitized;
    }
  }

  return { errors: [], fields };
};

/**
 * Total downloads of a box: the sum of every file's downloadCount across its
 * versions, providers and architectures, the number the box row carries beside
 * the per-file counts.
 * @param {Object} box - A box with nested versions, providers, architectures and files
 * @returns {number} Total download count
 */
const sumBoxDownloads = box =>
  (box.versions || [])
    .flatMap(version => version.providers || [])
    .flatMap(provider => provider.architectures || [])
    .flatMap(architecture => architecture.files || [])
    .reduce((total, file) => total + (file.downloadCount || 0), 0);

export { parseBoxContentFields, sumBoxDownloads };
