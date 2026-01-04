import { createInstance } from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import HttpApi from "i18next-http-backend";
import { initReactI18next } from "react-i18next";

import { log } from "../utils/Logger";

// Default supported languages
let supportedLngs = ["en", "es"];

// Export getSupportedLanguages for Navbar
export const getSupportedLanguages = () => supportedLngs;

const i18n = createInstance({
  // Static config: define namespaces and fallback language here
  fallbackLng: "en",
  ns: ["common", "auth"],
  defaultNS: "common",
  debug: true,
  interpolation: {
    escapeValue: false, // React already safes from xss
  },
  react: {
    useSuspense: true,
  },
});

// Register plugins immediately to avoid NO_I18NEXT_INSTANCE error
i18n.use(HttpApi).use(LanguageDetector).use(initReactI18next);

const initI18n = async () => {
  try {
    const response = await fetch("/api/health");
    if (response.ok) {
      const data = await response.json();
      if (data.supported_languages) {
        supportedLngs = data.supported_languages;
        log.app.info(
          "Frontend using backend-detected locales: ",
          supportedLngs
        );
      }
    }
  } catch (error) {
    log.app.error("Failed to fetch supported languages", { error });
  }

  await i18n.init({
    // Dynamic config: only things that depend on async data
    supportedLngs,
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
    backend: {
      loadPath: "/locales/{{lng}}/{{ns}}.json",
    },
  });
};

export const i18nPromise = initI18n();

export default i18n;
