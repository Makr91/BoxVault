import { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { BrowserRouter } from 'react-router-dom';

import ErrorBoundary from './ErrorBoundary';
import { NavbarSearchProvider } from './NavbarSearch';

/**
 * Mount an estate app once its i18n is ready, inside the providers every
 * app renders through: i18n, Suspense for the lazy locale loads, the shared
 * error boundary, the navbar search binding and the router.
 *
 * @param {Object} options - The app's side of the mount
 * @param {Function} options.App - The app's root component
 * @param {Object} options.i18n - The instance from `createI18n`
 * @param {Promise<void>} options.ready - The init promise from `createI18n`
 * @param {boolean} [options.showErrorDetails] - Whether the error fallback shows the stack
 * @param {Function} [options.onError] - Called with the error and info when the boundary catches
 * @returns {Promise<void>} Resolves once the app is rendered
 */
export const mountApp = ({ App, i18n, ready, showErrorDetails = false, onError = null }) =>
  ready.then(() => {
    createRoot(document.getElementById('root')).render(
      <I18nextProvider i18n={i18n}>
        <Suspense fallback="Loading...">
          <ErrorBoundary showErrorDetails={showErrorDetails} onError={onError}>
            <NavbarSearchProvider>
              <BrowserRouter>
                <App />
              </BrowserRouter>
            </NavbarSearchProvider>
          </ErrorBoundary>
        </Suspense>
      </I18nextProvider>
    );
  });
