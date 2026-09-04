import 'bootstrap/dist/css/bootstrap.min.css';

import App from './App';
import { configureLogger, log, mountApp, reportRenderError } from './chrome';
import { fetchHealth, i18n, i18nPromise } from './chromeProps';
import version from './version.json';

configureLogger({ fetchHealth, reportUrl: '/api/client-errors' });

log.app.info('BoxVault application starting', {
  name: version.name,
  version: version.version,
});

mountApp({
  App,
  i18n,
  ready: i18nPromise,
  showErrorDetails: import.meta.env.DEV,
  onError: reportRenderError,
});
