/**
 * The session bus every estate app shares: `login` when a session was
 * established by the app's own page, `logout` when a call decided the
 * session is invalid, `sessionEnded` with the page to return to when the
 * session died outside the app, and whatever else an app emits.
 *
 * @returns {{ on: (event: string, callback: Function) => () => void, emit: (event: string, detail?: unknown) => void, endSession: (detail?: { returnTo?: string }) => void }} The bus
 */
export const createSessionEvents = () => {
  const listeners = new Map();

  const on = (event, callback) => {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    listeners.get(event).add(callback);
    return () => {
      listeners.get(event)?.delete(callback);
    };
  };

  const emit = (event, detail = null) => {
    [...(listeners.get(event) || [])].forEach(callback => callback(detail));
  };

  const endSession = ({ returnTo = `${window.location.pathname}${window.location.search}` } = {}) =>
    emit('sessionEnded', { returnTo });

  return { on, emit, endSession };
};

const readUntilTerminated = async (reader, decoder) => {
  const { done, value } = await reader.read();
  if (done) {
    return false;
  }
  if (decoder.decode(value, { stream: true }).includes('session-terminated')) {
    return true;
  }
  return readUntilTerminated(reader, decoder);
};

/**
 * Listen on a backend's server-sent session stream and end the session
 * when it answers 401 or pushes `session-terminated`, reconnecting after
 * every interruption.
 *
 * @param {Object} options - The stream
 * @param {string} options.url - The event-stream URL
 * @param {Object|(() => Promise<Object>)} options.headers - Request headers carrying the session, or a function resolving them per connection
 * @param {Function} options.onEnded - Called once the session is gone
 * @param {number} [options.retryMs] - Delay before reconnecting
 * @returns {() => void} Stops listening
 */
export const subscribeTerminateStream = ({ url, headers, onEnded, retryMs = 15000 }) => {
  let stopped = false;
  let timer = null;
  const controller = new AbortController();

  const listen = async () => {
    try {
      const requestHeaders = typeof headers === 'function' ? await headers() : headers;
      const response = await fetch(url, { headers: requestHeaders, signal: controller.signal });
      if (response.status === 401) {
        onEnded();
        return;
      }
      if (!response.ok || !response.body) {
        throw new Error(`session event stream failed (${response.status})`);
      }
      const terminated = await readUntilTerminated(response.body.getReader(), new TextDecoder());
      if (terminated) {
        onEnded();
        return;
      }
    } catch {
      if (stopped || controller.signal.aborted) {
        return;
      }
    }
    if (!stopped) {
      timer = setTimeout(listen, retryMs);
    }
  };

  listen();

  return () => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
    }
    controller.abort();
  };
};
