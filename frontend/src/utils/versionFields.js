// The backend field spelling for release-notes/deprecation is being settled
// by a parallel backend change; read both spellings defensively per the wire
// brief until it lands.
export const readReleaseNotes = version => version.releaseNotes ?? version.release_notes ?? null;

export const readDeprecated = version => Boolean(version.deprecated);

export const readDeprecationReason = version =>
  version.deprecationReason ?? version.deprecation_reason ?? null;
