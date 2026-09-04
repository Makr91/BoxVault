import { CanceledError, create, isCancel } from 'axios';

const CONTENT_TYPES = { json: 'application/json', 'octet-stream': 'application/octet-stream' };
const MESSAGE_KEYS = {
  401: 'errors.accessDenied',
  403: 'errors.accessDenied',
  404: 'errors.notFound',
};

const textOf = value => (typeof value === 'string' ? value : '');

const isAbort = error =>
  isCancel(error) || error?.name === 'AbortError' || error?.name === 'CanceledError';

/**
 * Build a path from raw segments, each URL-encoded, so a name carrying a
 * reserved character never breaks the request.
 * @param {...(string|number)} segments - The path segments
 * @returns {string} The path, starting with a slash
 */
export const encodePath = (...segments) =>
  segments.map(segment => `/${encodeURIComponent(String(segment))}`).join('');

/**
 * The one error shape every request of the client fails with: the HTTP
 * status (0 for a network failure), the server's own message, an i18n key
 * for the status, the parsed body, and the request that failed.
 */
export class ApiError extends Error {
  constructor({ method, url, cause, messageKeys }) {
    const response = cause.response || null;
    const body = response?.data;
    const fields = body && typeof body === 'object' ? body : {};
    const serverMessage =
      textOf(fields.message) || textOf(fields.error_description) || textOf(fields.error);
    super(serverMessage || cause.message);
    this.name = 'ApiError';
    this.status = response?.status || 0;
    this.code = textOf(fields.error) || textOf(fields.code);
    this.messageKey = ApiError.keyFor(this.status, cause, messageKeys);
    this.serverMessage = serverMessage;
    this.data = body ?? null;
    this.response = response
      ? { status: response.status, data: body, headers: response.headers }
      : null;
    this.request = { method, url };
    this.cause = cause;
  }

  static keyFor(status, cause, messageKeys) {
    if (messageKeys[status]) {
      return messageKeys[status];
    }
    if (status === 0) {
      return cause.isAxiosError ? 'errors.network' : 'errors.request';
    }
    return MESSAGE_KEYS[status] || 'errors.request';
  }
}

/**
 * The one HTTP client every estate app calls its APIs through: an axios
 * instance of its own, the session's headers resolved per request against
 * the absolute URL sent (so a DPoP proof binds to the right target), one
 * replay after a 401 when the session can recover, the session ended when
 * it cannot, and every failure thrown as `ApiError`.
 *
 * @param {Object} options - The app's side of the client
 * @param {string} options.baseUrl - The public origin the API is reached at, the one the session signs its headers for
 * @param {string} [options.requestOrigin] - Where the browser sends the request, `baseUrl` unless a dev proxy answers same-origin (then empty)
 * @param {Object} options.session - A session provider: `headers(method, url)`, and optionally `retryAuth()`, `adoptResponse(headers)`, `endSession()`
 * @param {(error: ApiError) => void} [options.onError] - Called once per failure before it is thrown
 * @returns {Object} `request`, `get`, `post`, `put`, `patch`, `delete`, `raw`, `resolve`
 */
export const createApiClient = ({ baseUrl, requestOrigin = baseUrl, session, onError = null }) => {
  const http = create();

  const resolve = path => `${baseUrl}${path}`;

  const buildHeaders = async ({ method, url, auth, headers, contentType }) => {
    const type = CONTENT_TYPES[contentType];
    const sessionHeaders = auth ? await session.headers(method, url) : {};
    return { ...(type ? { 'Content-Type': type } : {}), ...sessionHeaders, ...headers };
  };

  const recover = async ({ error, auth, skipAuthRefresh, attempt }) => {
    if (isAbort(error) || !auth || skipAuthRefresh || error.response?.status !== 401) {
      throw error;
    }
    const recovered = await Promise.resolve()
      .then(() => session.retryAuth?.())
      .catch(() => false);
    if (!recovered) {
      session.endSession?.();
      throw error;
    }
    try {
      return await attempt();
    } catch (replayError) {
      if (!isAbort(replayError) && replayError.response?.status === 401) {
        session.endSession?.();
      }
      throw replayError;
    }
  };

  const request = async ({
    method,
    path,
    params,
    body,
    headers = {},
    contentType = 'json',
    auth = true,
    signal,
    onUploadProgress,
    responseType = 'json',
    skipAuthRefresh = false,
    messageKeys = {},
  }) => {
    const url = resolve(path);
    const attempt = async () =>
      http.request({
        method,
        url: `${requestOrigin}${path}`,
        params,
        data: body,
        signal,
        onUploadProgress,
        responseType,
        headers: await buildHeaders({ method, url, auth, headers, contentType }),
      });
    try {
      if (signal?.aborted) {
        throw new CanceledError();
      }
      const response = await attempt().catch(error =>
        recover({ error, auth, skipAuthRefresh, attempt })
      );
      session.adoptResponse?.(response.headers);
      return response.data;
    } catch (error) {
      if (isAbort(error)) {
        throw error;
      }
      const failure = new ApiError({ method, url, cause: error, messageKeys });
      onError?.(failure);
      throw failure;
    }
  };

  const raw = async (method, path, { headers = {}, auth = true, ...init } = {}) => {
    const url = resolve(path);
    const sessionHeaders = auth ? await session.headers(method, url) : {};
    return fetch(`${requestOrigin}${path}`, {
      ...init,
      method,
      headers: { ...sessionHeaders, ...headers },
    });
  };

  return {
    request,
    resolve,
    raw,
    get: (path, options = {}) => request({ ...options, method: 'GET', path }),
    post: (path, body, options = {}) => request({ ...options, method: 'POST', path, body }),
    put: (path, body, options = {}) => request({ ...options, method: 'PUT', path, body }),
    patch: (path, body, options = {}) => request({ ...options, method: 'PATCH', path, body }),
    delete: (path, options = {}) => request({ ...options, method: 'DELETE', path }),
  };
};
