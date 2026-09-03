const STORE_NAME = 'keys';
const KEY_ID = 'session';
const ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN = { name: 'ECDSA', hash: 'SHA-256' };

export const base64url = buffer => {
  const bytes = new Uint8Array(buffer);
  let text = '';
  for (const byte of bytes) {
    text += String.fromCharCode(byte);
  }
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const encodeJson = value => base64url(new TextEncoder().encode(JSON.stringify(value)));

const htuOf = url => {
  const target = new URL(url, window.location.origin);
  return `${target.origin}${target.pathname}`;
};

const openDb = name =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const withStore = async (name, mode, operation) => {
  const db = await openDb(name);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
};

const publicJwk = async keyPair => {
  const { crv, kty, x, y } = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  return { crv, kty, x, y };
};

/**
 * The DPoP key pair of one browser session, kept non-extractable in
 * IndexedDB under the app's storage prefix, and the proof one request
 * carries.
 *
 * @param {Object} options - The app's side of the key
 * @param {string} options.storagePrefix - Names the IndexedDB database, `<prefix>-dpop`
 * @returns {{ proof: (method: string, url: string, accessToken?: string) => Promise<string>, clearKey: () => Promise<void> }} The proof builder and the key reset for sign-out
 */
export const createDpop = ({ storagePrefix }) => {
  const dbName = `${storagePrefix}-dpop`;
  let keyPairPromise = null;

  const loadKeyPair = async () => {
    const stored = await withStore(dbName, 'readonly', store => store.get(KEY_ID)).catch(
      () => null
    );
    if (stored?.privateKey && stored?.publicKey) {
      return stored;
    }
    const generated = await crypto.subtle.generateKey(ALGORITHM, false, ['sign', 'verify']);
    await withStore(dbName, 'readwrite', store => store.put(generated, KEY_ID)).catch(() => null);
    return generated;
  };

  const getKeyPair = () => {
    keyPairPromise ||= loadKeyPair();
    return keyPairPromise;
  };

  const clearKey = async () => {
    keyPairPromise = null;
    await withStore(dbName, 'readwrite', store => store.delete(KEY_ID)).catch(() => null);
  };

  const proof = async (method, url, accessToken = '') => {
    const keyPair = await getKeyPair();
    const jwk = await publicJwk(keyPair);
    const jti = base64url(crypto.getRandomValues(new Uint8Array(16)));
    const payload = {
      jti,
      htm: method.toUpperCase(),
      htu: htuOf(url),
      iat: Math.floor(Date.now() / 1000),
    };
    if (accessToken) {
      payload.ath = base64url(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(accessToken))
      );
    }
    const signingInput = `${encodeJson({ typ: 'dpop+jwt', alg: 'ES256', jwk })}.${encodeJson(payload)}`;
    const signature = await crypto.subtle.sign(
      SIGN,
      keyPair.privateKey,
      new TextEncoder().encode(signingInput)
    );
    return `${signingInput}.${base64url(signature)}`;
  };

  return { proof, clearKey };
};
