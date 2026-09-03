import 'bootstrap/dist/css/bootstrap.min.css';

import App from './App';
import { mountApp } from './chrome';
import { i18n, i18nPromise } from './chromeProps';
import { log } from './utils/Logger';
import version from './version.json';

log.app.info('BoxVault application starting', {
  name: version.name,
  version: version.version,
});

mountApp({
  App,
  i18n,
  ready: i18nPromise,
  showErrorDetails: import.meta.env.NODE_ENV === 'development',
  onError: (error, info) =>
    log.app.error('Unhandled render error', {
      error: error.message,
      stack: info?.componentStack,
    }),
});
