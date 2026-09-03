const CACHE_KEY = 'gravatar_cache';
const TTL_MS = 24 * 60 * 60 * 1000;

const inflight = new Map();

const readCache = () => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch {
    return {};
  }
};

const writeCache = cache => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    return undefined;
  }
  return undefined;
};

const cachedProfile = emailHash => {
  const cache = readCache();
  const entry = cache[emailHash];
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.timestamp > TTL_MS) {
    delete cache[emailHash];
    writeCache(cache);
    return null;
  }
  return entry.profile;
};

const rememberProfile = (emailHash, profile) => {
  const cache = readCache();
  cache[emailHash] = { profile, timestamp: Date.now() };
  writeCache(cache);
};

/**
 * Fetch a Gravatar profile once per email hash: answers from the local-storage
 * cache for a day, and while a fetch is in flight every caller shares it.
 * @param {string} emailHash - The email hash
 * @param {Function} fetchProfile - Async function that fetches the profile for a hash
 * @returns {Promise<Object|null>}
 */
export const fetchWithDeduplication = (emailHash, fetchProfile) => {
  const cached = cachedProfile(emailHash);
  if (cached) {
    return Promise.resolve(cached);
  }
  if (inflight.has(emailHash)) {
    return inflight.get(emailHash);
  }
  const promise = fetchProfile(emailHash)
    .then(profile => {
      if (profile) {
        rememberProfile(emailHash, profile);
      }
      inflight.delete(emailHash);
      return profile;
    })
    .catch(error => {
      inflight.delete(emailHash);
      throw error;
    });
  inflight.set(emailHash, promise);
  return promise;
};
