const passport = require('passport');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const client = require('openid-client');
const { Strategy: OidcStrategy } = require('openid-client/passport');
const { loadConfig } = require('../utils/config-loader');
const db = require('../models');
const { handleExternalUser } = require('./external-user-handler');

let authConfig;
let boxConfig;
try {
  authConfig = loadConfig('auth');
  boxConfig = loadConfig('app');
} catch (e) {
  console.error(`Failed to load configuration: ${e.message}`);
}

/**
 * Passport.js configuration for ZoneWeaver
 */

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
        console.error('JWT Strategy error:', error.message);
        return done(error, false);
      }
    }
  )
);

// Serialize/deserialize functions (required by passport but not used for JWT)
passport.serializeUser((user, done) => {
  done(null, user.userId);
});

passport.deserializeUser(async (userId, done) => {
  try {
    const { user: UserModel } = db;
    const user = await UserModel.findByPk(userId);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

/**
 * LDAP Strategy - External authentication via LDAP
 */
async function setupLdapStrategy() {
  // Wait for database to be ready before setting up strategies
  try {
    // Test database access with new schema
    const { user: UserModel } = db;
    await UserModel.findOne({ limit: 1 }); // Test query to ensure schema is ready
  } catch {
    log.database.info('Database not ready yet, waiting for migrations to complete');
    // Wait a bit for migrations to finish
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Only setup LDAP if enabled in configuration
  if (!config.authentication?.ldap_enabled?.value) {
    log.auth.info('LDAP authentication disabled in configuration');
    return;
  }

  log.auth.info('Setting up LDAP authentication strategy');
  log.auth.debug('LDAP Configuration', {
    url: config.authentication.ldap_url.value,
    bindDn: config.authentication.ldap_bind_dn.value,
    searchBase: config.authentication.ldap_search_base.value,
    searchFilter: config.authentication.ldap_search_filter.value,
    searchAttributes: config.authentication.ldap_search_attributes.value,
    tlsRejectUnauthorized: config.authentication.ldap_tls_reject_unauthorized?.value,
  });

  passport.use(
    'ldap',
    new LdapStrategy(
      {
        server: {
          url: config.authentication.ldap_url.value,
          bindDN: config.authentication.ldap_bind_dn.value,
          bindCredentials: config.authentication.ldap_bind_credentials.value,
          searchBase: config.authentication.ldap_search_base.value,
          searchFilter: config.authentication.ldap_search_filter.value,
          searchAttributes: config.authentication.ldap_search_attributes.value
            .split(',')
            .map(s => s.trim()) || ['displayName', 'mail', 'memberOf'],
          tlsOptions: {
            rejectUnauthorized: config.authentication.ldap_tls_reject_unauthorized?.value || false,
          },
        },
      },
      async (ldapUser, done) => {
        try {
          log.auth.info('LDAP authentication successful for user', {
            user: ldapUser.uid || ldapUser.cn || 'unknown',
          });
          log.auth.debug('LDAP User Profile', {
            uid: ldapUser.uid,
            cn: ldapUser.cn,
            displayName: ldapUser.displayName,
            mail: ldapUser.mail,
            memberOf: ldapUser.memberOf,
            profileKeys: Object.keys(ldapUser),
          });

          // Handle external user authentication and provisioning
          const result = await handleExternalUser('ldap', ldapUser);
          log.auth.info('LDAP user processing complete', { username: result.username });
          return done(null, result);
        } catch (error) {
          log.auth.error('LDAP Strategy error during user processing', {
            error: error.message,
            stack: error.stack,
          });
          return done(error, false);
        }
      }
    )
  );

  log.auth.info('LDAP authentication strategy configured successfully');
}

/**
 * OIDC Multiple Providers Strategy Setup
 */
async function setupOidcProviders() {
  try {
    await db.user.findOne({ limit: 1 });
  } catch {
    console.log('Database not ready yet, waiting for migrations to complete');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  const oidcProvidersConfig = authConfig.auth?.oidc?.providers || {};

  if (!oidcProvidersConfig || Object.keys(oidcProvidersConfig).length === 0) {
    console.log('No OIDC providers configured');
    return;
  }

  console.log('Setting up OIDC authentication providers');

  const providerPromises = Object.entries(oidcProvidersConfig).map(async ([providerName, providerConfig]) => {
    try {
      const enabled = providerConfig.enabled?.value;
      const displayName = providerConfig.display_name?.value;
      const issuer = providerConfig.issuer?.value;
      const clientId = providerConfig.client_id?.value;
      const clientSecret = providerConfig.client_secret?.value;
      const scope = providerConfig.scope?.value || 'openid profile email';

      if (!enabled) {
        console.log(`Skipping disabled OIDC provider: ${providerName}`);
        return;
      }

      if (!issuer || !clientId || !clientSecret) {
        console.error(`Invalid OIDC provider configuration: ${providerName}`);
        return;
      }

      const oidcConfig = await client.discovery(new URL(issuer), clientId, clientSecret);
      const strategyName = `oidc-${providerName}`;
      
      passport.use(
        strategyName,
        new OidcStrategy(
          {
            name: strategyName,
            config: oidcConfig,
            scope,
            callbackURL: `${boxConfig.boxvault.origin.value}/api/auth/oidc/callback`,
          },
          async (tokens, verified) => {
            try {
              const userinfo = tokens.claims();
              const result = await handleExternalUser(`oidc-${providerName}`, userinfo, db, authConfig);
              return verified(null, result);
            } catch (error) {
              console.error(`OIDC Strategy error for ${providerName}:`, error.message);
              return verified(error, false);
            }
          }
        )
      );

      console.log(`OIDC provider configured: ${providerName}`);
    } catch (error) {
      console.error(`Failed to setup OIDC provider ${providerName}:`, error.message);
    }
  });

  await Promise.all(providerPromises);
  console.log('OIDC provider setup completed');
}

/**
 * Initialize passport strategies
 */
async function initializeStrategies() {
  const enabledStrategies = authConfig.auth?.enabled_strategies?.value || [];
  if (enabledStrategies.includes('oidc')) {
    await setupOidcProviders();
  }
}

module.exports = {
  passport,
  initializeStrategies
};
