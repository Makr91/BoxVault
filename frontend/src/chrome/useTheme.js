import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';
const THEME_VALUES = ['auto', 'light', 'dark'];
const NEXT_PREFERENCE = { auto: 'light', light: 'dark', dark: 'auto' };

const subscribeToColorScheme = onChange => {
  const query = window.matchMedia(DARK_SCHEME_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

const systemPrefersDark = () => window.matchMedia(DARK_SCHEME_QUERY).matches;

export const isThemePreference = value => THEME_VALUES.includes(value);

/**
 * Theme state shared by every estate app: the stored preference (auto,
 * light or dark) resolved against the operating system scheme, stamped on
 * the document as data-bs-theme, mirrored to localStorage.theme, and handed
 * to onPersist on every user toggle so the app can write it through to the
 * account.
 */
export const useTheme = ({ initialPreference = '', onPersist = null } = {}) => {
  const [preference, setPreferenceState] = useState(() =>
    isThemePreference(initialPreference)
      ? initialPreference
      : localStorage.getItem('theme') || 'auto'
  );
  const prefersDark = useSyncExternalStore(subscribeToColorScheme, systemPrefersDark);
  const theme = preference === 'auto' ? (prefersDark && 'dark') || 'light' : preference;

  useEffect(() => {
    document.documentElement.setAttribute('data-bs-theme', theme);
    localStorage.setItem('theme', preference);
  }, [theme, preference]);

  const setPreference = useCallback(
    (next, { persist = true } = {}) => {
      if (!isThemePreference(next)) {
        return;
      }
      setPreferenceState(next);
      if (persist && onPersist) {
        onPersist(next);
      }
    },
    [onPersist]
  );

  const toggleTheme = useCallback(
    () => setPreference(NEXT_PREFERENCE[preference] || 'auto'),
    [preference, setPreference]
  );

  return { theme, preference, setPreference, toggleTheme };
};
