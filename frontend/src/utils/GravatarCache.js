/**
 * GravatarCache - Client-side cache for Gravatar profiles
 * Stores gravatar data in localStorage to avoid rate limiting
 * Implements request deduplication to prevent simultaneous fetches
 */

const CACHE_KEY = "boxvault_gravatar_cache";
const DEFAULT_TTL_HOURS = 24; // 24 hours default

// Track in-flight requests to prevent duplicate fetches
const inflightRequests = new Map();

/**
 * Get cache TTL from backend config or use default
 * @returns {number} TTL in milliseconds
 */
const getCacheTTL = () =>
  // Could be fetched from /api/health or config endpoint
  // For now, use default
  DEFAULT_TTL_HOURS * 60 * 60 * 1000;
/**
 * Get entire cache from localStorage
 * @returns {Object} Cache object
 */
const getCache = () => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch (error) {
    console.error("Error reading gravatar cache:", error);
    return {};
  }
};

/**
 * Save cache to localStorage
 * @param {Object} cache - Cache object to save
 */
const saveCache = (cache) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error("Error saving gravatar cache:", error);
  }
};

/**
 * Get cached gravatar profile for emailHash
 * @param {string} emailHash - Email hash
 * @returns {Object|null} Cached profile or null if not found/expired
 */
export const getCachedGravatar = (emailHash) => {
  const cache = getCache();
  const cached = cache[emailHash];

  if (!cached) {
    return null;
  }

  const ttl = getCacheTTL();
  const age = Date.now() - cached.timestamp;

  if (age > ttl) {
    // Expired - remove from cache
    delete cache[emailHash];
    saveCache(cache);
    return null;
  }

  return cached.profile;
};

/**
 * Store gravatar profile in cache
 * @param {string} emailHash - Email hash
 * @param {Object} profile - Gravatar profile data
 */
export const cacheGravatar = (emailHash, profile) => {
  const cache = getCache();
  cache[emailHash] = {
    profile,
    timestamp: Date.now(),
  };
  saveCache(cache);
};

/**
 * Clear entire gravatar cache
 */
export const clearGravatarCache = () => {
  localStorage.removeItem(CACHE_KEY);
};

/**
 * Clear expired entries from cache
 */
export const cleanExpiredCache = () => {
  const cache = getCache();
  const ttl = getCacheTTL();
  let cleaned = false;

  Object.keys(cache).forEach((emailHash) => {
    const age = Date.now() - cache[emailHash].timestamp;
    if (age > ttl) {
      delete cache[emailHash];
      cleaned = true;
    }
  });

  if (cleaned) {
    saveCache(cache);
  }
};

/**
 * Fetch gravatar with deduplication
 * Ensures only ONE fetch happens for each emailHash, even if multiple components request simultaneously
 * @param {string} emailHash - Email hash
 * @param {Function} fetchFunction - Function to fetch gravatar (async)
 * @returns {Promise<Object>} Gravatar profile
 */
export const fetchWithDeduplication = (emailHash, fetchFunction) => {
  // Check cache first
  const cached = getCachedGravatar(emailHash);
  if (cached) {
    return Promise.resolve(cached);
  }

  // Check if already fetching
  if (inflightRequests.has(emailHash)) {
    // Wait for existing request
    return inflightRequests.get(emailHash);
  }

  // Start new fetch and store promise
  const promise = fetchFunction(emailHash)
    .then((profile) => {
      if (profile) {
        cacheGravatar(emailHash, profile);
      }
      inflightRequests.delete(emailHash);
      return profile;
    })
    .catch((error) => {
      inflightRequests.delete(emailHash);
      throw error;
    });

  inflightRequests.set(emailHash, promise);
  return promise;
};

const GravatarCache = {
  getCachedGravatar,
  cacheGravatar,
  clearGravatarCache,
  cleanExpiredCache,
  fetchWithDeduplication,
};

export default GravatarCache;
