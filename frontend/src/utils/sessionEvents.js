import { log } from "./Logger";

const RETRY_DELAY_MS = 15000;

const redirectToLogin = () => {
  localStorage.removeItem("user");
  const returnTo = encodeURIComponent(
    window.location.pathname + window.location.search
  );
  window.location.href = `/login?returnTo=${returnTo}`;
};

const pump = async (reader, decoder) => {
  const { done, value } = await reader.read();
  if (done) {
    return false;
  }
  if (decoder.decode(value, { stream: true }).includes("session-terminated")) {
    return true;
  }
  return pump(reader, decoder);
};

export const subscribeSessionEvents = (accessToken) => {
  let stopped = false;
  let timer = null;
  const controller = new AbortController();

  const listen = async () => {
    try {
      const response = await fetch(
        `${window.location.origin}/api/notifications/events`,
        {
          headers: { "x-access-token": accessToken },
          signal: controller.signal,
        }
      );
      if (response.status === 401) {
        redirectToLogin();
        return;
      }
      if (!response.ok || !response.body) {
        throw new Error(`Session event stream failed (${response.status})`);
      }
      const terminated = await pump(
        response.body.getReader(),
        new TextDecoder()
      );
      if (terminated) {
        redirectToLogin();
        return;
      }
    } catch (error) {
      if (stopped || controller.signal.aborted) {
        return;
      }
      log.auth.debug("Session event stream interrupted", {
        error: error.message,
      });
    }
    if (!stopped) {
      timer = setTimeout(listen, RETRY_DELAY_MS);
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
