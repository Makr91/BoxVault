import { createInstance } from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import HttpBackend from "i18next-http-backend";
import { initReactI18next } from "react-i18next";

// Create i18n instance
const i18n = createInstance();

// Store environment and languages from health API
let healthData = null;

// Auto-detect available languages from health endpoint
const detectAvailableLanguages = async () => {
  try {
    // Fetch languages and environment from health API
    const response = await fetch("/api/health");
    if (response.ok) {
      const data = await response.json();
      healthData = data; // Store for later use
      console.log(
        "Frontend using backend-detected locales:",
        data.supported_languages
      );
      console.log("Environment:", data.environment);
      return data.supported_languages || [];
    }
  } catch {
    // Fallback if API not available
  }

  // Fallback: If API is unavailable, return empty array and let i18next handle defaults
  console.log("Health API unavailable, using i18next defaults");
  return [];
};

// Initialize i18n with detected languages
const initializeI18n = async () => {
  let supportedLanguages = await detectAvailableLanguages();

  // Normalize en-US to en
  supportedLanguages = supportedLanguages.map((lang) =>
    lang === "en-US" ? "en" : lang
  );
  supportedLanguages = [...new Set(supportedLanguages)];

  // Add cimode in development for testing translation keys
  if (healthData && healthData.environment === "development") {
    if (!supportedLanguages.includes("cimode")) {
      supportedLanguages = [...supportedLanguages, "cimode"];
      console.log(
        "Added cimode for development. Final supported languages:",
        supportedLanguages
      );
    }
  }

  const fallbackLanguage =
    supportedLanguages.length > 0 ? supportedLanguages[0] : undefined;

  const i18nInstance = i18n
    // Load translation using http backend
    .use(HttpBackend)
    // Detect user language
    .use(LanguageDetector)
    // Pass the i18n instance to react-i18next
    .use(initReactI18next);

  await i18nInstance.init({
    // Fallback language
    fallbackLng: "en",

    // Load only language, not region-specific files
    load: "languageOnly",

    // Dynamically detected supported languages
    supportedLngs: supportedLanguages,

    // Allow languages not explicitly defined (like cimode)
    nonExplicitSupportedLngs: true,

    // Debug mode for development
    debug: import.meta.env.NODE_ENV === "development",

    // Language detection options
    detection: {
      // Order of language detection methods
      order: ["localStorage", "navigator", "htmlTag"],
      // Cache user language
      caches: ["localStorage"],
      // Key for localStorage
      lookupLocalStorage: "i18nextLng",
    },

    // Backend configuration
    backend: {
      // Translation file path pattern
      loadPath: "/locales/{{lng}}/{{ns}}.json",
    },

    // Namespaces
    ns: ["common", "auth"],
    defaultNS: "common",

    // Interpolation options
    interpolation: {
      // React already does escaping
      escapeValue: false,
    },

    // React options
    react: {
      // Use Suspense for translations loading
      useSuspense: true,
    },
  });

  return { supportedLanguages, fallbackLanguage };
};

// Export function to get supported languages (filter cimode in production)
export const getSupportedLanguages = () => {
  const langs = i18n.options?.supportedLngs || [];

  // Filter out cimode in production (keep it in development for testing)
  if (healthData && healthData.environment !== "development") {
    return langs.filter((lang) => lang !== "cimode");
  }

  return langs;
};

// Initialize the i18n system
initializeI18n().catch((error) => {
  console.error("Failed to initialize i18n:", error);
});

export default i18n;
