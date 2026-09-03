import { createI18n } from '../chrome';
import { log } from '../utils/Logger';

const loadSupportedLanguages = async () => {
  try {
    const response = await fetch('/api/health');
    if (response.ok) {
      const data = await response.json();
      if (data.supported_languages) {
        log.app.info('Frontend using backend-detected locales: ', data.supported_languages);
        return data.supported_languages;
      }
    }
  } catch (error) {
    log.app.error('Failed to fetch supported languages', { error });
  }
  return ['en', 'es'];
};

const { i18n, ready, getSupportedLanguages } = createI18n({ loadSupportedLanguages, debug: true });

export { getSupportedLanguages };

export const i18nPromise = ready;

export default i18n;
