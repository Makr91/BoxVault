import { createInstance } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpApi from 'i18next-http-backend';
import { initReactI18next } from 'react-i18next';

/**
 * The i18next instance every estate app renders through: the app's own
 * `common` namespace first, the byte-identical `shared` namespace behind it
 * for every chrome and pages key, `auth` beside them, language detection
 * from localStorage then the browser, and `<html lang>` stamped on change.
 *
 * @param {Object} options - The app's side of the setup
 * @param {() => (string[]|Promise<string[]>)} options.loadSupportedLanguages - Resolves the languages the app ships
 * @param {boolean} [options.debug] - i18next debug logging
 * @returns {{ i18n: Object, ready: Promise<void>, getSupportedLanguages: () => string[] }} The instance, the init promise that gates the first render, and the resolved language list
 */
export const createI18n = ({ loadSupportedLanguages, debug = false }) => {
  let supportedLngs = ['en'];

  const i18n = createInstance({
    fallbackLng: 'en',
    ns: ['common', 'shared', 'auth'],
    defaultNS: 'common',
    fallbackNS: 'shared',
    debug,
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: true,
    },
  });

  i18n.use(HttpApi).use(LanguageDetector).use(initReactI18next);

  i18n.on('languageChanged', lng => {
    document.documentElement.lang = lng;
  });

  const ready = Promise.resolve()
    .then(loadSupportedLanguages)
    .then(languages => {
      if (Array.isArray(languages) && languages.length > 0) {
        supportedLngs = languages;
      }
    })
    .then(() =>
      i18n.init({
        supportedLngs,
        detection: {
          order: ['localStorage', 'navigator'],
          caches: ['localStorage'],
        },
        backend: {
          loadPath: '/locales/{{lng}}/{{ns}}.json',
        },
      })
    );

  return { i18n, ready, getSupportedLanguages: () => supportedLngs };
};
