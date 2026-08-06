// Shared OIDC provider-name sanitizer: provider names are interpolated into
// redirect URLs, so only URL-safe identifier characters are accepted.
export const sanitizeProvider = (provider) => {
  const safeProviderPattern = /^[A-Za-z0-9_-]+$/;
  if (typeof provider !== "string" || !safeProviderPattern.test(provider)) {
    throw new Error("Invalid authentication provider");
  }
  return provider;
};
