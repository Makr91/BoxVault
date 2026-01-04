import { createInstance } from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import HttpApi from "i18next-http-backend";
import { initReactI18next } from "react-i18next";

import { log } from "../utils/Logger";

// Default supported languages
let supportedLngs = ["en", "es"];

// Export getSupportedLanguages for Navbar
export const getSupportedLanguages = () => supportedLngs;

const i18n = createInstance();

const initializeI18n = async () => {
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

  i18n
    .use(HttpApi)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      supportedLngs,
      fallbackLng: "en",
      detection: {
        order: ["localStorage", "navigator"],
        caches: ["localStorage"],
      },
      backend: {
        loadPath: "/locales/{{lng}}/{{ns}}.json",
      },
      react: {
        useSuspense: true,
      },
    });
};

initializeI18n();

export default i18n;
