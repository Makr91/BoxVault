// identity.js
import { createHash } from 'crypto';
import { loadConfig } from './config-loader.js';

const generateEmailHash = email =>
  createHash('sha256').update(email.toLowerCase().trim()).digest('hex');

// Fallback only for a missing/malformed knob — the real seed lives in the YAML
// knob (app config: boxvault.org_code_seed).
const DEFAULT_ORG_CODE_SEED = 'B00000';
const ORG_CODE_MAX = 'FFFFFF';
const ORG_CODE_PATTERN = /^[0-9A-F]{6}$/;

/**
 * Next sequential 6-hex org code for locally-created organizations.
 *
 * Codes count upward from the configured seed: the next code is
 * max(existing org_code in [seed..FFFFFF]) + 1, or the seed itself when the
 * range is empty. Admin-assigned customer IDs (mirrored from the auth server)
 * live below the seed and are never sequential, so the two namespaces cannot
 * collide as long as the seed is above them.
 *
 * @param {Object} db - Database models (needs organization + Sequelize)
 * @param {Object|null} transaction - Optional transaction for the lookup
 * @returns {Promise<string>} Six uppercase hex characters
 */
const generateOrgCode = async (db, transaction = null) => {
  const configuredSeed = loadConfig('app').boxvault?.org_code_seed?.value;
  const normalizedSeed =
    typeof configuredSeed === 'string' ? configuredSeed.trim().toUpperCase() : '';
  const seed = ORG_CODE_PATTERN.test(normalizedSeed) ? normalizedSeed : DEFAULT_ORG_CODE_SEED;

  const highest = await db.organization.max('org_code', {
    where: { org_code: { [db.Sequelize.Op.between]: [seed, ORG_CODE_MAX] } },
    ...(transaction ? { transaction } : {}),
  });

  if (!highest) {
    return seed;
  }
  if (highest >= ORG_CODE_MAX) {
    throw new Error(`Organization code space exhausted (last assigned code: ${highest})`);
  }
  return (parseInt(highest, 16) + 1).toString(16).toUpperCase().padStart(6, '0');
};

export { generateEmailHash, generateOrgCode };
