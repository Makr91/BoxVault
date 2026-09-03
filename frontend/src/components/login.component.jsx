import PropTypes from 'prop-types';
import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FaEye, FaEyeSlash } from 'react-icons/fa6';
import { useNavigate, useLocation, Link } from 'react-router-dom';

import EventBus from '../common/EventBus';
import AuthService from '../services/auth.service';
import { log } from '../utils/Logger';
import {
  redirectToProvider,
  sortMethodsByDefault,
  readStoredLoginMethod,
  storeLoginMethod,
} from '../utils/providers';

import AuthShell, { AuthAlert, AuthSpinner } from './AuthShell.component';
import ProviderButtons from './ProviderButtons.component';

const SILENT_SSO_FLAG = 'boxvault_silent_sso_attempted';

const returnPathOf = urlParams => {
  const returnTo = urlParams.get('returnTo');
  if (returnTo) {
    const decodedUrl = decodeURIComponent(returnTo);
    if (decodedUrl.startsWith('/') && !decodedUrl.startsWith('//')) {
      return decodedUrl;
    }
  }
  return '';
};

const rememberIntendedUrl = urlParams => {
  const returnTo = returnPathOf(urlParams);
  if (returnTo) {
    localStorage.setItem('boxvault_intended_url', returnTo);
    return;
  }
  if (window.location.pathname !== '/login') {
    localStorage.setItem('boxvault_intended_url', window.location.pathname);
  }
};

const resolveReturnPath = urlParams => returnPathOf(urlParams) || '/profile';

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

const resolveInitialMode = ({ providerParam, hasOidc, localEnabled }) => {
  if (!localEnabled) {
    return 'sso';
  }
  if (!hasOidc || providerParam === 'local') {
    return 'password';
  }
  return readStoredLoginMethod();
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

const LocalLoginForm = ({ formValues, onChange, onSubmit, loading }) => {
  const { t } = useTranslation(['auth']);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      <div className="auth-field">
        <label className="auth-field-label" htmlFor="login-username">
          {t('login.username')}
        </label>
        <div className="auth-input-wrap">
          <input
            id="login-username"
            name="username"
            type="text"
            autoComplete="username"
            value={formValues.username}
            onChange={onChange}
          />
        </div>
      </div>

      <div className="auth-field">
        <label className="auth-field-label" htmlFor="login-password">
          {t('login.password')}
        </label>
        <div className="auth-input-wrap auth-input-wrap--password">
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
  onChange: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
};

const LoginMethods = ({
  view,
  visibleOidcMethods,
  defaultProvider,
  loading,
  formValues,
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
  formValues: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onSelectProvider: PropTypes.func.isRequired,
  onSwitchMode: PropTypes.func.isRequired,
};

const Login = () => {
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
    () => enabledAuthMethods.some(method => method.id === 'local'),
    [enabledAuthMethods]
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
    if (AuthService.getCurrentUser()) {
      return false;
    }
    if (sessionStorage.getItem(SILENT_SSO_FLAG)) {
      return false;
    }
    return enabledAuthMethods.some(method => method.id === `oidc-${defaultProvider}`);
  }, [methodsLoading, silentLogin, defaultProvider, urlParams, enabledAuthMethods]);

  useEffect(() => {
    let cancelled = false;

    const loadAuthMethods = async () => {
      try {
        const result = await AuthService.getAuthMethods();
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
  }, [t]);

  useEffect(() => {
    if (!shouldAttemptSilent) {
      return;
    }
    try {
      sessionStorage.setItem(SILENT_SSO_FLAG, '1');
      rememberIntendedUrl(urlParams);
      redirectToProvider(defaultProvider, '?prompt=none');
    } catch (err) {
      log.auth.error('Silent SSO attempt failed to start', {
        error: err.message,
      });
    }
  }, [shouldAttemptSilent, defaultProvider, urlParams]);

  const handleSwitchMode = next => {
    setChosenMode(next);
    storeLoginMethod(next);
  };

  const handleOidcLogin = provider => {
    rememberIntendedUrl(urlParams);
    setLoading(true);
    setStatusMessage('');
    try {
      redirectToProvider(provider);
    } catch (err) {
      log.auth.error('Invalid OIDC provider selected', { error: err.message });
      setLoading(false);
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

    if (!formValues.username || !formValues.password) {
      return;
    }

    setStatusMessage('');
    setLoading(true);

    AuthService.login(formValues.username, formValues.password, formValues.stayLoggedIn)
      .then(user => {
        EventBus.dispatch('login', user);
        navigate(resolveReturnPath(urlParams), { replace: true });
      })
      .catch(error => {
        const resMessage = error.response?.data?.message || error.message || error.toString();

        setLoading(false);
        setStatusMessage(resMessage);
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
    <AuthShell title={t('login.headline')}>
      {message && <AuthAlert tone="danger">{message}</AuthAlert>}

      {methodsLoading ? (
        <AuthSpinner label={t('common:loading')} />
      ) : (
        <LoginMethods
          view={view}
          visibleOidcMethods={visibleOidcMethods}
          defaultProvider={defaultProvider}
          loading={loading}
          formValues={formValues}
          onChange={handleInputChange}
          onSubmit={handleLogin}
          onSelectProvider={handleOidcLogin}
          onSwitchMode={handleSwitchMode}
        />
      )}

      {!methodsLoading && registrationOpen && (
        <p className="auth-foot">
          {t('login.newHere')}{' '}
          <Link to="/register" className="auth-link">
            {t('login.createAccount')}
          </Link>
        </p>
      )}
    </AuthShell>
  );
};

export default Login;
