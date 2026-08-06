import { log } from "./Logger";

const normalizeUrl = (url) => url.replace(/\/+$/, "");

const validateIssuerFormat = (issuer) => {
  if (!issuer || !issuer.startsWith("https://")) {
    return false;
  }

  try {
    const url = new URL(issuer);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    log.auth.warn("Invalid issuer URL format", { issuer });
    return false;
  }
};

const fetchTrustedIssuers = async () => {
  const response = await fetch(
    `${window.location.origin}/api/auth/oidc/issuers`
  );

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    log.auth.warn("Trusted issuers endpoint returned non-JSON response", {
      contentType,
      status: response.status,
    });
    return [];
  }

  const data = await response.json();
  return data.issuers || [];
};

const isIssuerTrusted = (issuer, trustedIssuers) => {
  const normalizedIssuer = normalizeUrl(issuer);
  const isTrusted = trustedIssuers.some(
    (trustedIssuer) => normalizeUrl(trustedIssuer.issuer) === normalizedIssuer
  );

  if (!isTrusted) {
    log.auth.warn("Issuer not in trusted whitelist", {
      issuer,
      normalizedIssuer,
      trustedIssuers: trustedIssuers.map((trustedIssuer) =>
        normalizeUrl(trustedIssuer.issuer)
      ),
    });
  }
  return isTrusted;
};

const extractIssuerFromToken = (accessToken) => {
  try {
    const jwtPayload = JSON.parse(atob(accessToken.split(".")[1]));
    if (!jwtPayload.id_token) {
      return "";
    }

    const idTokenPayload = JSON.parse(atob(jwtPayload.id_token.split(".")[1]));
    return idTokenPayload.iss || "";
  } catch (error) {
    log.auth.debug("Could not extract issuer from id_token", {
      error: error.message,
    });
    return "";
  }
};

const resolveIssuer = (accessToken, trustedIssuers) => {
  const issuer = extractIssuerFromToken(accessToken);

  if (!issuer || !isIssuerTrusted(issuer, trustedIssuers)) {
    return "";
  }

  if (!validateIssuerFormat(issuer)) {
    return "";
  }

  return issuer;
};

const resolveAuthServerUrl = async (accessToken) => {
  const trustedIssuers = await fetchTrustedIssuers();
  return resolveIssuer(accessToken, trustedIssuers);
};

export { fetchTrustedIssuers, resolveIssuer, resolveAuthServerUrl };
