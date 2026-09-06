// helpers.js
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from '../../utils/config-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_BCRYPT_ROUNDS = 10;

const BLOCKLIST = new Set(
  JSON.parse(readFileSync(join(__dirname, '../../rules/password-blocklist.json'), 'utf8')).map(
    entry => entry.toLowerCase()
  )
);

const COMPOSITION = [
  { knob: 'local_password_require_uppercase', test: /[A-Z]/, name: 'uppercase' },
  { knob: 'local_password_require_lowercase', test: /[a-z]/, name: 'lowercase' },
  { knob: 'local_password_require_numbers', test: /[0-9]/, name: 'number' },
  { knob: 'local_password_require_symbols', test: /[^A-Za-z0-9]/, name: 'symbol' },
];

const getBcryptRounds = () =>
  loadConfig('auth').auth?.local?.local_bcrypt_rounds || DEFAULT_BCRYPT_ROUNDS;

/**
 * The failing rules of a password beyond its length: the route's blocklist
 * (`rule: blocklist`) and the four composition knobs of the auth
 * configuration, off by default, each answering `rule: pattern` named by
 * the character class it requires.
 * @param {string} password - The candidate password
 * @param {string} pointer - JSON Pointer of the password in the request body
 * @returns {Array<{pointer: string, rule: string, params: Object}>} Failing rules, or none
 */
const getPasswordPolicyErrors = (password, pointer) => {
  const local = loadConfig('auth').auth?.local || {};
  const candidate = password || '';

  if (BLOCKLIST.has(candidate.toLowerCase())) {
    return [{ pointer, rule: 'blocklist', params: {} }];
  }
  return COMPOSITION.filter(entry => local[entry.knob] && !entry.test.test(candidate)).map(
    entry => ({ pointer, rule: 'pattern', params: { pattern: entry.name } })
  );
};

export { getBcryptRounds, getPasswordPolicyErrors };
