export const decodeBase64url = segment => {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
};

export const decodeJwt = token => {
  const [, payload = ''] = String(token || '').split('.');
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64url(payload)));
  } catch {
    return null;
  }
};
