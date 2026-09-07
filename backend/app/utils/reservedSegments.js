const RESERVED_SEGMENTS = [
  'about',
  'organizations',
  'login',
  'auth',
  'register',
  'invite',
  'profile',
  'admin',
  'org-console',
  'setup',
  'callback',
  'docs',
  'schema',
  'private',
  'push',
  'search',
  'vm',
  'authenticator',
  'authenticator-method',
  'passwordRecovery',
  'passwordReset',
  'registration',
  'complete-onboarding',
  'qrcode',
  'provider-registration',
  'public',
  'oauth2',
  'activate',
  'activated',
  'ciba',
  'connect',
  'continue',
  'link-account-consent',
  'link-account',
  'user',
  'org',
  'notifications',
  'error',
  'api',
  'isos',
  'assets',
  'brand',
  'locales',
  'fonts',
  'themes',
  'watches',
];

const RESERVED_LOWERCASE = new Set(RESERVED_SEGMENTS.map(segment => segment.toLowerCase()));

/**
 * Whether a name is a first path segment the shared UI or the identity
 * provider owns, so no organization may take it; compared case-insensitively.
 * @param {string} name - The organization name
 * @returns {boolean}
 */
const isReservedSegment = name => RESERVED_LOWERCASE.has(String(name).toLowerCase());

export { RESERVED_SEGMENTS, isReservedSegment };
