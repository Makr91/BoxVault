const passport = require('passport');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const client = require('openid-client');
const { loadConfig } = require('../utils/config-loader');
const { log } = require('../utils/Logger');
const db = require('../models');
const { handleExternalUser } = require('./external-user-handler');

let authConfig;
try {
  authConfig = loadConfig('auth');
} catch (e) {
  log.error.error(`Failed to load configuration: ${e.message}`);
}

/**
 * Passport.js configuration for BoxVault
 * Following ARMOR pattern - provider-agnostic OIDC implementation
 */

// Store OIDC configurations globally (ARMOR pattern)
const oidcConfigurations = new Map();

passport.use(
  'jwt',
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: authConfig.auth.jwt.jwt_secret.value,
    },
    async (payload, done) => {
      try {
        const user = await db.user.findByPk(payload.id);

        if (!user || user.suspended) {
          return done(null, false, { message: 'Invalid token - user not found' });
        }

        return done(null, {
          id: user.id,
          username: user.username,
          email: user.email,
          isServiceAccount: payload.isServiceAccount || false,
        });
      } catch (error) {
        log.error.error('JWT Strategy error:', error.message);
        return done(error, false);
      }
    }
  )
);

// Serialize/deserialize functions (required by passport but not used for JWT)
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (userId, done) => {
  try {
    const user = await db.user.findByPk(userId);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

/**
 * Get OIDC configuration for a provider
 * @param {string} providerName - OIDC provider name
 * @returns {Object|null} OIDC configuration or null if not found
 */
const getOidcConfiguration = providerName => oidcConfigurations.get(providerName);

/**
 * Build authorization URL for OIDC provider
 * @param {string} providerName - OIDC provider name
 * @param {string} redirectUri - Callback redirect URI
 * @param {string} state - State parameter for CSRF protection
 * @param {string} codeVerifier - PKCE code verifier
 * @returns {Promise<URL>} Authorization URL
 */
const buildAuthorizationUrl = async (providerName, redirectUri, state, codeVerifier) => {
  const config = oidcConfigurations.get(providerName);
  if (!config) {
    throw new Error(`OIDC configuration not found for provider: ${providerName}`);
  }

  const providerConfig = authConfig.auth.oidc.providers[providerName];
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

  const authParams = {
    redirect_uri: redirectUri,
    scope: providerConfig.scope?.value || 'openid profile email',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  };

  log.auth.info('Building authorization URL', {
    provider: providerName,
    redirectUri,
  });

  return client.buildAuthorizationUrl(config, authParams);
};

/**
 * Handle OIDC callback and authenticate user
 * @param {string} providerName - OIDC provider name
 * @param {URL} currentUrl - Current callback URL
 * @param {string} state - Expected state value
 * @param {string} codeVerifier - PKCE code verifier
 * @returns {Promise<Object>} User and tokens
 */
const handleOidcCallback = async (providerName, currentUrl, state, codeVerifier) => {
  const config = oidcConfigurations.get(providerName);
  if (!config) {
    throw new Error(`OIDC configuration not found for provider: ${providerName}`);
  }

  try {
    log.auth.info('Processing OIDC callback', { provider: providerName });

    let tokens;
    try {
      tokens = await client.authorizationCodeGrant(config, currentUrl, {
        expectedState: state,
        pkceCodeVerifier: codeVerifier,
      });
    } catch (grantError) {
      // Log detailed token exchange error
      log.auth.error('Token exchange failed', {
        provider: providerName,
        error: grantError.message,
        errorType: grantError.constructor.name,
        errorDetails: grantError.error,
        errorDescription: grantError.error_description,
      });
      throw grantError;
    }

    const userinfo = tokens.claims();
    log.auth.debug('OIDC user claims received', {
      provider: providerName,
      subject: userinfo.sub,
      email: userinfo.email,
    });

    const user = await handleExternalUser(`oidc-${providerName}`, userinfo, db, authConfig);

    log.auth.info('OIDC authentication successful', {
      provider: providerName,
      username: user.username,
    });

    return { user, tokens };
  } catch (error) {
    log.auth.error(`OIDC callback error for ${providerName}:`, error.message);
    throw error;
  }
};

/**
 * Build end session URL for RP-initiated logout
 * @param {string} providerName - OIDC provider name
 * @param {string} postLogoutRedirectUri - Where to redirect after logout
 * @param {string} state - State parameter
 * @param {string} idToken - ID token hint
 * @returns {URL|null} End session URL or null if not supported
 */
const buildEndSessionUrl = (providerName, postLogoutRedirectUri, state, idToken) => {
  const config = oidcConfigurations.get(providerName);
  if (!config) {
    log.auth.warn(`OIDC configuration not found for provider: ${providerName}`);
    return null;
  }

  const endSessionEndpoint = config.serverMetadata().end_session_endpoint;
  if (!endSessionEndpoint) {
    log.auth.info(
      `Provider ${providerName} does not support end_session_endpoint, skipping RP-initiated logout`
    );
    return null;
  }

  const endSessionParams = {
    post_logout_redirect_uri: postLogoutRedirectUri,
    state,
    id_token_hint: idToken,
  };

  log.auth.info('Building end session URL', {
    provider: providerName,
    endpoint: endSessionEndpoint,
  });

  return client.buildEndSessionUrl(config, endSessionParams);
};

/**
 * OIDC Provider Setup - Following ARMOR pattern
 * No passport strategies - uses openid-client API directly
 */
const setupOidcProviders = async () => {
  try {
    await db.user.findOne({ limit: 1 });
  } catch {
    log.app.info('Database not ready yet, waiting for migrations to complete');
    await new Promise(resolve => {
      setTimeout(resolve, 2000);
    });
  }

  const oidcProvidersConfig = authConfig.auth?.oidc?.providers || {};

  if (!oidcProvidersConfig || Object.keys(oidcProvidersConfig).length === 0) {
    log.app.info('No OIDC providers configured');
    return;
  }

  log.app.info('Setting up OIDC authentication providers', {
    providerCount: Object.keys(oidcProvidersConfig).length,
  });

  const providerPromises = Object.entries(oidcProvidersConfig).map(
    async ([providerName, providerConfig]) => {
      try {
        const enabled = providerConfig.enabled?.value;
        const issuer = providerConfig.issuer?.value;
        const clientId = providerConfig.client_id?.value;
        const clientSecret = providerConfig.client_secret?.value;

        if (!enabled) {
          log.app.info(`Skipping disabled OIDC provider: ${providerName}`);
          return { success: false, provider: providerName, reason: 'disabled' };
        }

        if (!issuer || !clientId || !clientSecret) {
          log.error.error(`Invalid OIDC provider configuration: ${providerName}`, {
            hasIssuer: !!issuer,
            hasClientId: !!clientId,
            hasClientSecret: !!clientSecret,
          });
          return { success: false, provider: providerName, reason: 'invalid_config' };
        }

        log.app.info(`Configuring OIDC provider: ${providerName}`, { issuer });

        // Get token endpoint auth method from provider config (ARMOR pattern)
        const authMethod =
          providerConfig.token_endpoint_auth_method?.value || 'client_secret_basic';

        log.app.info(`Using token endpoint auth method: ${authMethod}`, { provider: providerName });

        // Create client authentication method (ARMOR pattern)
        let clientAuth;
        switch (authMethod) {
          case 'client_secret_basic':
            clientAuth = client.ClientSecretBasic(clientSecret);
            break;
          case 'client_secret_post':
            clientAuth = client.ClientSecretPost(clientSecret);
            break;
          case 'none':
            clientAuth = client.None();
            break;
          default:
            clientAuth = client.ClientSecretBasic(clientSecret);
        }

        // Discover OIDC configuration with proper client authentication
        const oidcConfig = await client.discovery(
          new URL(issuer),
          clientId,
          clientSecret,
          clientAuth
        );

        // Store configuration for later use by helper functions
        oidcConfigurations.set(providerName, oidcConfig);

        log.app.info(`OIDC provider configured successfully: ${providerName}`, {
          issuer,
          authEndpoint: oidcConfig.serverMetadata().authorization_endpoint,
          tokenEndpoint: oidcConfig.serverMetadata().token_endpoint,
          endSessionEndpoint: oidcConfig.serverMetadata().end_session_endpoint || 'not supported',
        });

        return { success: true, provider: providerName };
      } catch (error) {
        log.error.error(`Failed to setup OIDC provider ${providerName}:`, {
          error: error.message,
          stack: error.stack,
        });
        return { success: false, provider: providerName, error: error.message };
      }
    }
  );

  const results = await Promise.allSettled(providerPromises);

  const successCount = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
  const failCount = results.length - successCount;

  log.app.info('OIDC provider setup completed', {
    total: results.length,
    successful: successCount,
    failed: failCount,
  });
};

/**
 * Initialize passport strategies
 */
const initializeStrategies = async () => {
  const enabledStrategies = authConfig.auth?.enabled_strategies?.value || [];

  log.app.info('Initializing authentication strategies', { enabledStrategies });

  if (enabledStrategies.includes('oidc')) {
    await setupOidcProviders();
  }

  log.app.info('Passport strategies initialized');
};

module.exports = {
  passport,
  initializeStrategies,
  getOidcConfiguration,
  buildAuthorizationUrl,
  handleOidcCallback,
  buildEndSessionUrl,
};
