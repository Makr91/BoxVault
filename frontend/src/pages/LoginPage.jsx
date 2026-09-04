import PropTypes from 'prop-types';
import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FaEye, FaEyeSlash } from 'react-icons/fa6';
import { useNavigate, useLocation, Link } from 'react-router-dom';

import { log } from '../chrome';

import {
  authShape,
  readStoredLoginMethod,
  returnToShape,
  sortMethodsByDefault,
  storeLoginMethod,
} from './auth';
import AuthShell, { AuthAlert, AuthSpinner } from './AuthShell';
import { responseMessage } from './itemShape';
import ProviderButtons from './ProviderButtons';

const rememberReturn = (returnTo, urlParams) => {
  const fromPage = window.location.pathname === '/login' ? '' : window.location.pathname;
  returnTo.remember(returnTo.fromParams(urlParams) || fromPage);
};

const getOidcErrorMessage = (error, t) => {
  switch (error) {
    case 'oidc_failed':
      return t('errors.oidcFailed');
    case 'access_denied':
      return t('errors.accessDenied');
    case 'no_provider':
      return t('errors.noProvider');
    case 'token_failed':
      return t('errors.failedToProcess');
    default:
      return error ? t('errors.authError', { error }) : '';
  }
};

const filterVisibleOidcMethods = (oidcMethods, providerParam) => {
  if (providerParam === 'local') {
    return [];
  }
  if (providerParam) {
    const gated = oidcMethods.filter(
      method => method.id === providerParam || method.id === `oidc-${providerParam}`
    );
    if (gated.length > 0) {
      return gated;
    }
  }
  return oidcMethods;
};

const hasSilentBlockingParams = urlParams =>
  !!(
    urlParams.get('provider') ||
    urlParams.get('error') ||
    urlParams.get('silent') ||
    urlParams.get('token') ||
    urlParams.get('logout')
  );

const resolveInitialMode = ({ providerParam, hasOidc, localEnabled, loginMethodKey }) => {
  if (!localEnabled) {
    return 'sso';
  }
  if (!hasOidc || providerParam === 'local') {
    return 'password';
  }
  return readStoredLoginMethod(loginMethodKey);
};

const deriveLoginView = ({
  mode,
  localEnabled,
  providerParam,
  oidcMethods,
  visibleOidcMethods,
}) => {
  const hasOidc = visibleOidcMethods.length > 0;
  const isGated =
    !!providerParam &&
    providerParam !== 'local' &&
    hasOidc &&
    visibleOidcMethods.length < oidcMethods.length;
  const passwordMode = mode === 'password' && localEnabled;

  return {
    showNoMethods: !hasOidc && !localEnabled,
    showLocalForm: passwordMode,
    showDivider: passwordMode && hasOidc,
    showButtons: hasOidc,
    showPasswordToggle: !passwordMode && localEnabled,
    showSsoToggle: passwordMode && hasOidc,
    showGatedLink: isGated,
  };
};

const LocalLoginForm = ({ formValues, errors, onChange, onSubmit, loading }) => {
  const { t } = useTranslation(['auth']);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      <div className="auth-field">
        <label className="auth-field-label" htmlFor="login-username">
          {t('login.username')}
        </label>
        <div className={`auth-input-wrap${errors.username ? ' has-error' : ''}`}>
          <input
            id="login-username"
            name="username"
            type="text"
            autoComplete="username"
            value={formValues.username}
            onChange={onChange}
          />
        </div>
        {errors.username && <p className="auth-field-error">{errors.username}</p>}
      </div>

      <div className="auth-field">
        <label className="auth-field-label" htmlFor="login-password">
          {t('login.password')}
        </label>
        <div
          className={`auth-input-wrap auth-input-wrap--password${errors.password ? ' has-error' : ''}`}
        >
          <input
            id="login-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={formValues.password}
            onChange={onChange}
          />
          <button
            type="button"
            className="auth-reveal"
            onClick={() => setShowPassword(visible => !visible)}
            aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
          >
            {showPassword ? <FaEyeSlash /> : <FaEye />}
          </button>
        </div>
        {errors.password && <p className="auth-field-error">{errors.password}</p>}
        <label className="auth-check">
          <input
            type="checkbox"
            name="stayLoggedIn"
            checked={formValues.stayLoggedIn}
            onChange={onChange}
          />
          <span>{t('login.stayLoggedIn')}</span>
        </label>
      </div>

      <button
        type="submit"
        className={`auth-btn auth-btn-primary auth-btn-block${loading ? ' is-loading' : ''}`}
        disabled={loading}
      >
        {t('login.signIn')}
      </button>
    </form>
  );
};

LocalLoginForm.propTypes = {
  formValues: PropTypes.shape({
    username: PropTypes.string.isRequired,
    password: PropTypes.string.isRequired,
    stayLoggedIn: PropTypes.bool.isRequired,
  }).isRequired,
  errors: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
};

const LoginMethods = ({
  view,
  visibleOidcMethods,
  defaultProvider,
  loading,
  loadingProvider,
  formValues,
  errors,
  onChange,
  onSubmit,
  onSelectProvider,
  onSwitchMode,
}) => {
  const { t } = useTranslation(['auth']);
  const hasLinks = view.showPasswordToggle || view.showSsoToggle || view.showGatedLink;

  return (
    <>
      {view.showNoMethods && <AuthAlert tone="info">{t('login.noMethods')}</AuthAlert>}
      {view.showLocalForm && (
        <LocalLoginForm
          formValues={formValues}
          errors={errors}
          onChange={onChange}
          onSubmit={onSubmit}
          loading={loading}
        />
      )}
      {view.showDivider && <div className="auth-or">{t('login.orSeparator')}</div>}
      {view.showButtons && (
        <ProviderButtons
          methods={visibleOidcMethods}
          defaultProvider={defaultProvider}
          loading={loading}
          loadingProvider={loadingProvider}
          onSelect={onSelectProvider}
        />
      )}
      {hasLinks && (
        <div className="auth-links">
          {view.showPasswordToggle && (
            <button
              type="button"
              className="auth-link auth-link-muted"
              onClick={() => onSwitchMode('password')}
            >
              {t('login.usePassword')}
            </button>
          )}
          {view.showSsoToggle && (
            <button
              type="button"
              className="auth-link auth-link-muted"
              onClick={() => onSwitchMode('sso')}
            >
              {t('login.useSso')}
            </button>
          )}
          {view.showGatedLink && (
            <Link to="/login" className="auth-link auth-link-muted">
              {t('login.otherOptions')}
            </Link>
          )}
        </div>
      )}
    </>
  );
};

LoginMethods.propTypes = {
  view: PropTypes.shape({
    showNoMethods: PropTypes.bool.isRequired,
    showLocalForm: PropTypes.bool.isRequired,
    showDivider: PropTypes.bool.isRequired,
    showButtons: PropTypes.bool.isRequired,
    showPasswordToggle: PropTypes.bool.isRequired,
    showSsoToggle: PropTypes.bool.isRequired,
    showGatedLink: PropTypes.bool.isRequired,
  }).isRequired,
  visibleOidcMethods: PropTypes.arrayOf(PropTypes.object).isRequired,
  defaultProvider: PropTypes.string,
  loading: PropTypes.bool.isRequired,
  loadingProvider: PropTypes.string,
  formValues: PropTypes.object.isRequired,
  errors: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onSelectProvider: PropTypes.func.isRequired,
  onSwitchMode: PropTypes.func.isRequired,
};

/**
 * The sign-in page every estate app with a login route draws the same way:
 * the app's enabled methods from `auth.methods()`, the local form where the
 * provider carries `login`, one button per identity provider through
 * `session.begin`, the remembered choice between the two, the one silent SSO
 * attempt per browser session, and the return path kept for the callback.
 */
const LoginPage = ({ session, returnTo, auth, appName }) => {
  const { t } = useTranslation(['auth', 'common']);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    document.title = t('login.pageTitle');
  }, [t]);

  const [formValues, setFormValues] = useState({
    username: '',
    password: '',
    stayLoggedIn: false,
  });
  const [loading, setLoading] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [statusMessage, setStatusMessage] = useState(location.state?.error || '');
  const [authMethods, setAuthMethods] = useState([]);
  const [methodsLoading, setMethodsLoading] = useState(true);
  const [defaultProvider, setDefaultProvider] = useState(null);
  const [silentLogin, setSilentLogin] = useState(false);
  const [localRegistrationEnabled, setLocalRegistrationEnabled] = useState(false);
  const [chosenMode, setChosenMode] = useState(null);

  const urlParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const providerParam = urlParams.get('provider');

  const oidcErrorMessage = useMemo(
    () => getOidcErrorMessage(urlParams.get('error'), t),
    [urlParams, t]
  );
  const message = statusMessage || oidcErrorMessage;

  const enabledAuthMethods = useMemo(
    () => authMethods.filter(method => method.enabled),
    [authMethods]
  );

  const localEnabled = useMemo(
    () =>
      typeof session.login === 'function' &&
      enabledAuthMethods.some(method => method.id === 'local'),
    [enabledAuthMethods, session]
  );

  const oidcMethods = useMemo(
    () =>
      sortMethodsByDefault(
        enabledAuthMethods.filter(method => method.id.startsWith('oidc-')),
        defaultProvider
      ),
    [enabledAuthMethods, defaultProvider]
  );

  const visibleOidcMethods = useMemo(
    () => filterVisibleOidcMethods(oidcMethods, providerParam),
    [oidcMethods, providerParam]
  );

  const mode =
    chosenMode ||
    resolveInitialMode({
      providerParam,
      hasOidc: visibleOidcMethods.length > 0,
      localEnabled,
      loginMethodKey: auth.loginMethodKey,
    });

  const view = useMemo(
    () =>
      deriveLoginView({
        mode,
        localEnabled,
        providerParam,
        oidcMethods,
        visibleOidcMethods,
      }),
    [mode, localEnabled, providerParam, oidcMethods, visibleOidcMethods]
  );

  const registrationOpen = localRegistrationEnabled || oidcMethods.length > 0;

  const shouldAttemptSilent = useMemo(() => {
    if (methodsLoading || !silentLogin || !defaultProvider) {
      return false;
    }
    if (hasSilentBlockingParams(urlParams)) {
      return false;
    }
    if (session.restore()) {
      return false;
    }
    if (sessionStorage.getItem(auth.silentSsoKey)) {
      return false;
    }
    return enabledAuthMethods.some(method => method.id === `oidc-${defaultProvider}`);
  }, [methodsLoading, silentLogin, defaultProvider, urlParams, enabledAuthMethods, session, auth]);

  useEffect(() => {
    let cancelled = false;

    const loadAuthMethods = async () => {
      try {
        const result = await auth.methods();
        if (cancelled) {
          return;
        }
        setAuthMethods(result.methods || []);
        setDefaultProvider(result.default_provider || null);
        setSilentLogin(!!result.silent_login);
        setLocalRegistrationEnabled(!!result.local_registration_enabled);
      } catch (error) {
        if (!cancelled) {
          log.auth.error('Error loading auth methods', {
            error: error.message,
          });
          setAuthMethods([{ id: 'local', name: t('login.localAccount'), enabled: true }]);
        }
      } finally {
        if (!cancelled) {
          setMethodsLoading(false);
        }
      }
    };

    loadAuthMethods();

    return () => {
      cancelled = true;
    };
  }, [auth, t]);

  useEffect(() => {
    if (!shouldAttemptSilent) {
      return;
    }
    try {
      sessionStorage.setItem(auth.silentSsoKey, '1');
      rememberReturn(returnTo, urlParams);
      session.begin({ method: defaultProvider, silent: true });
    } catch (err) {
      log.auth.error('Silent SSO attempt failed to start', {
        error: err.message,
      });
    }
  }, [shouldAttemptSilent, defaultProvider, urlParams, auth, returnTo, session]);

  const handleSwitchMode = next => {
    setChosenMode(next);
    storeLoginMethod(auth.loginMethodKey, next);
  };

  const handleOidcLogin = provider => {
    rememberReturn(returnTo, urlParams);
    setLoadingProvider(provider);
    setStatusMessage('');
    try {
      session.begin({ method: provider });
    } catch (err) {
      log.auth.error('Invalid OIDC provider selected', { error: err.message });
      setLoadingProvider(null);
      setStatusMessage(t('errors.invalidProvider'));
    }
  };

  const handleInputChange = event => {
    const { name, value, type, checked } = event.target;
    setFormValues(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleLogin = event => {
    event.preventDefault();

    const errors = {};
    if (!formValues.username) {
      errors.username = t('errors.fieldRequired');
    }
    if (!formValues.password) {
      errors.password = t('errors.fieldRequired');
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setStatusMessage('');
    setLoading(true);

    session
      .login(formValues.username, formValues.password, formValues.stayLoggedIn)
      .then(() => {
        navigate(returnTo.fromParams(urlParams) || '/', { replace: true });
      })
      .catch(error => {
        setLoading(false);
        setStatusMessage(responseMessage(error, error.message || error.toString()));
      });
  };

  if (shouldAttemptSilent) {
    return (
      <AuthShell title={t('login.checkingSession')}>
        <AuthSpinner label={t('login.checkingSession')} />
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('login.headline', { app: appName })}>
      {message && <AuthAlert tone="danger">{message}</AuthAlert>}

      {methodsLoading ? (
        <AuthSpinner label={t('common:loading')} />
      ) : (
        <LoginMethods
          view={view}
          visibleOidcMethods={visibleOidcMethods}
          defaultProvider={defaultProvider}
          loading={loading}
          loadingProvider={loadingProvider}
          formValues={formValues}
          errors={fieldErrors}
          onChange={handleInputChange}
          onSubmit={handleLogin}
          onSelectProvider={handleOidcLogin}
          onSwitchMode={handleSwitchMode}
        />
      )}

      {!methodsLoading && registrationOpen && (
        <p className="auth-foot">
          {t('login.newHere', { app: appName })}{' '}
          <Link to="/register" className="auth-link">
            {t('login.createAccount')}
          </Link>
        </p>
      )}
    </AuthShell>
  );
};

LoginPage.propTypes = {
  session: PropTypes.object.isRequired,
  returnTo: returnToShape.isRequired,
  auth: authShape.isRequired,
  appName: PropTypes.string.isRequired,
};

export default LoginPage;
