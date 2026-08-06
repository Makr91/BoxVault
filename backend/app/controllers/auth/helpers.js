// helpers.js
import { loadConfig } from '../../utils/config-loader.js';

const DEFAULT_BCRYPT_ROUNDS = 10;

const getBcryptRounds = () =>
  loadConfig('auth').auth?.local?.local_bcrypt_rounds?.value || DEFAULT_BCRYPT_ROUNDS;

// Password policy (#18): enforces the auth.local.local_password_* knobs.
// Returns a translated error message, or null when the password passes.
const getPasswordPolicyError = (password, req) => {
  const local = loadConfig('auth').auth?.local || {};
  const candidate = password || '';

  const minLength = local.local_password_min_length?.value || 8;
  if (candidate.length < minLength) {
    return req.__('auth.passwordTooShort', { min: minLength });
  }
  if (local.local_password_require_uppercase?.value && !/[A-Z]/.test(candidate)) {
    return req.__('auth.passwordRequiresUppercase');
  }
  if (local.local_password_require_lowercase?.value && !/[a-z]/.test(candidate)) {
    return req.__('auth.passwordRequiresLowercase');
  }
  if (local.local_password_require_numbers?.value && !/[0-9]/.test(candidate)) {
    return req.__('auth.passwordRequiresNumber');
  }
  if (local.local_password_require_symbols?.value && !/[^A-Za-z0-9]/.test(candidate)) {
    return req.__('auth.passwordRequiresSymbol');
  }
  return null;
};

export { getBcryptRounds, getPasswordPolicyError };
