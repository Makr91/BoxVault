// Shared relative-time formatting built on Intl.RelativeTimeFormat.
// Picks the largest sensible unit (e.g. "3 weeks ago", "2 hours ago").
const UNITS = [
  { unit: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: 'week', ms: 7 * 24 * 60 * 60 * 1000 },
  { unit: 'day', ms: 24 * 60 * 60 * 1000 },
  { unit: 'hour', ms: 60 * 60 * 1000 },
  { unit: 'minute', ms: 60 * 1000 },
  { unit: 'second', ms: 1000 },
];

/**
 * Format a date as a localized relative-time string.
 *
 * @param {string|number|Date} date - Anything Date can parse.
 * @param {string} [locale] - BCP 47 tag; defaults to the runtime locale.
 * @returns {string} e.g. "3 weeks ago", or "" for invalid input.
 */
export const formatRelativeTime = (date, locale = undefined) => {
  const time = new Date(date).getTime();
  if (Number.isNaN(time)) {
    return '';
  }

  const diff = time - Date.now();
  const magnitude = Math.abs(diff);
  const match = UNITS.find(({ ms }) => magnitude >= ms) || UNITS[UNITS.length - 1];
  const value = Math.trunc(diff / match.ms);

  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(value, match.unit);
  } catch {
    // i18next's "cimode" pseudo-locale is not a BCP 47 tag, and Intl throws a
    // RangeError on it — which would take down whatever is rendering.
    return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(value, match.unit);
  }
};
