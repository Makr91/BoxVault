import jwt from 'jsonwebtoken';
import axios from 'axios';
import { loadConfig } from '../utils/config-loader.js';
import { log } from '../utils/Logger.js';
import { getOidcConfiguration } from '../auth/passport.js';

/**
 * Middleware to automatically refresh OIDC access tokens before they expire
 * Checks if OIDC token expires in < 5 minutes and refreshes if needed
 */
const oidcTokenRefresh = async (req, res, next) => {
  const token = req.headers['x-access-token'];

  if (!token) {
    return next();
  }

  try {
    const authConfig = loadConfig('auth');
    // Decode JWT to check OIDC token expiration
    const decoded = jwt.verify(token, authConfig.auth.jwt.jwt_secret.value);

    // Only process OIDC-authenticated users
    if (!decoded.provider || !decoded.provider.startsWith('oidc-')) {
      return next();
    }

    // Check if we have required fields for refresh
    if (!decoded.oidc_expires_at || !decoded.oidc_refresh_token) {
      log.auth.warn('OIDC token missing refresh data, skipping refresh', {
        userId: decoded.id,
        provider: decoded.provider,
        hasExpiresAt: !!decoded.oidc_expires_at,
        hasRefreshToken: !!decoded.oidc_refresh_token,
      });
      return next();
    }

    const now = Date.now();
    const expiresAt = decoded.oidc_expires_at;
    const timeUntilExpiry = expiresAt - now;

    // Get refresh threshold from config (default 5 minutes)
    const refreshThresholdMinutes =
      authConfig.auth?.oidc?.token_refresh_threshold_minutes?.value || 5;
    const refreshThreshold = refreshThresholdMinutes * 60 * 1000;

    // If token expires in more than 5 minutes, no need to refresh
    if (timeUntilExpiry > refreshThreshold) {
      log.auth.debug('OIDC token still valid, no refresh needed', {
        userId: decoded.id,
        timeUntilExpiryMinutes: Math.floor(timeUntilExpiry / 60000),
      });
      return next();
    }

    // Token is expiring soon or expired, attempt refresh
    log.auth.info('OIDC token expiring soon, attempting refresh', {
      userId: decoded.id,
      provider: decoded.provider,
      timeUntilExpiryMinutes: Math.floor(timeUntilExpiry / 60000),
      isExpired: timeUntilExpiry < 0,
    });

    const providerName = decoded.provider.replace('oidc-', '');
    const oidcConfig = getOidcConfiguration(providerName);

    if (!oidcConfig) {
      log.auth.error('OIDC configuration not found for token refresh', {
        provider: providerName,
      });
      return res.status(401).json({
        error: 'TOKEN_REFRESH_FAILED',
        message: 'Provider configuration not available',
        requiresReauth: true,
      });
    }

    try {
      // Use openid-client to refresh the token
      const tokenEndpoint = oidcConfig.serverMetadata().token_endpoint;
      const { clientId } = oidcConfig;

      log.auth.debug('Refreshing OIDC token', {
        provider: providerName,
        tokenEndpoint,
        userId: decoded.id,
      });

      // Get client authentication from config
      const providerConfig = authConfig.auth.oidc.providers[providerName];
      const clientSecret = providerConfig.client_secret?.value;

      // Prepare refresh token request
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: decoded.oidc_refresh_token,
        client_id: clientId,
      });

      // Determine auth method
      const authMethod = providerConfig.token_endpoint_auth_method?.value || 'client_secret_basic';

      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
      };

      if (authMethod === 'client_secret_basic') {
        // Send credentials in Authorization header
        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        headers.Authorization = `Basic ${credentials}`;
      } else if (authMethod === 'client_secret_post') {
        // Send credentials in POST body
        params.append('client_secret', clientSecret);
      }

      const response = await axios.post(tokenEndpoint, params.toString(), { headers });

      const newTokens = response.data;

      log.auth.info('OIDC token refresh successful', {
        provider: providerName,
        userId: decoded.id,
        hasAccessToken: !!newTokens.access_token,
        hasRefreshToken: !!newTokens.refresh_token,
      });

      // Calculate new expiration time
      const defaultExpiryMinutes = authConfig.auth?.oidc?.token_default_expiry_minutes?.value || 30;
      const newExpiresAt = newTokens.expires_in
        ? Date.now() + newTokens.expires_in * 1000
        : Date.now() + defaultExpiryMinutes * 60 * 1000;

      // Generate new JWT with refreshed tokens
      const newJwtToken = jwt.sign(
        {
          id: decoded.id,
          isServiceAccount: false,
          provider: decoded.provider,
          id_token: newTokens.id_token || decoded.id_token, // Use new if provided, else keep old
          oidc_access_token: newTokens.access_token,
          oidc_refresh_token: newTokens.refresh_token || decoded.oidc_refresh_token, // Some providers don't return new refresh token
          oidc_expires_at: newExpiresAt,
        },
        authConfig.auth.jwt.jwt_secret.value,
        {
          algorithm: 'HS256',
          allowInsecureKeySizes: true,
          expiresIn: authConfig.auth.jwt.jwt_expiration.value || '24h',
        }
      );

      // Return new token in custom header for frontend to update
      res.setHeader('X-Refreshed-Token', newJwtToken);

      // Update req object with new token data for this request
      req.userId = decoded.id;
      req.isServiceAccount = false;
      req.oidcAccessToken = newTokens.access_token;

      log.auth.info('New JWT token generated after OIDC refresh', {
        userId: decoded.id,
        provider: providerName,
      });

      return next();
    } catch (refreshError) {
      // Token refresh failed - likely refresh token is also expired
      log.auth.error('OIDC token refresh failed', {
        provider: providerName,
        userId: decoded.id,
        error: refreshError.message,
        status: refreshError.response?.status,
        errorData: refreshError.response?.data,
      });

      // Return 401 to force re-authentication
      return res.status(401).json({
        error: 'TOKEN_EXPIRED',
        message: 'Session expired. Please log in again.',
        requiresReauth: true,
      });
    }
  } catch (jwtError) {
    // JWT verification failed or other error
    log.auth.debug('JWT verification failed in refresh middleware', {
      error: jwtError.message,
    });
    return next();
  }
};

export { oidcTokenRefresh };
