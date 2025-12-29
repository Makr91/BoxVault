const {
  buildAuthorizationUrl,
  handleOidcCallback,
  buildEndSessionUrl,
} = require('../auth/passport');
const jwt = require('jsonwebtoken');
const client = require('openid-client');
const { loadConfig } = require('../utils/config-loader');
const { log } = require('../utils/Logger');

module.exports = function (app) {
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
    next();
  });

  /**
   * @swagger
   * /api/auth/oidc/callback:
   *   get:
   *     summary: Handle OIDC callback from providers
   *     description: Process the callback from OIDC provider and generate JWT token
   *     tags: [Authentication]
   *     parameters:
   *       - in: query
   *         name: code
   *         schema:
   *           type: string
   *         description: Authorization code from OIDC provider
   *       - in: query
   *         name: state
   *         schema:
   *           type: string
   *         description: State parameter for CSRF protection
   *     responses:
   *       302:
   *         description: Redirect to frontend with token or error
   *       400:
   *         description: OIDC provider not enabled or authentication failed
   *       403:
   *         description: Access denied - provisioning policy rejection
   *       500:
   *         description: Internal server error
   */
  app.get('/api/auth/oidc/callback', async (req, res) => {
    log.auth.info('OIDC callback received', {
      sessionId: req.sessionID,
      hasSession: !!req.session,
      sessionKeys: req.session ? Object.keys(req.session) : [],
    });

    // Retrieve session data
    const provider = req.session?.oidcProvider;
    const state = req.session?.oidcState;
    const codeVerifier = req.session?.oidcCodeVerifier;
    const returnUrl = req.session?.oidcReturnUrl || '/';

    log.auth.debug('OIDC callback session data', {
      provider,
      hasState: !!state,
      hasCodeVerifier: !!codeVerifier,
      returnUrl,
    });

    // Clean up session data
    if (req.session) {
      delete req.session.oidcProvider;
      delete req.session.oidcState;
      delete req.session.oidcCodeVerifier;
      delete req.session.oidcReturnUrl;
    }

    if (!provider || !state || !codeVerifier) {
      log.auth.error('Missing OIDC session data during callback', {
        hasProvider: !!provider,
        hasState: !!state,
        hasCodeVerifier: !!codeVerifier,
      });
      return res.redirect('/?error=no_session_data');
    }

    try {
      const authConfig = loadConfig('auth');
      const appConfig = loadConfig('app');

      log.auth.info('Processing OIDC callback', { provider });

      // Create current URL for callback processing
      const currentUrl = new URL(appConfig.boxvault.origin.value + req.url);

      log.auth.debug('OIDC callback URL', {
        currentUrl: currentUrl.toString(),
        hasCode: !!req.query.code,
        hasState: !!req.query.state,
      });

      // Handle the callback using helper function
      const { user, tokens } = await handleOidcCallback(provider, currentUrl, state, codeVerifier);

      if (!user) {
        log.auth.error('OIDC callback: No user object returned', { provider });
        return res.redirect('/?error=user_creation_failed');
      }

      // Generate JWT token with id_token and access_token stored for RP-initiated logout and favorites
      const token = jwt.sign(
        {
          id: user.id,
          isServiceAccount: false,
          provider: `oidc-${provider}`,
          id_token: tokens.id_token, // Store for RP-initiated logout
          oidc_access_token: tokens.access_token, // Store for auth server API calls (favorites, etc.)
        },
        authConfig.auth.jwt.jwt_secret.value,
        {
          algorithm: 'HS256',
          allowInsecureKeySizes: true,
          expiresIn: authConfig.auth.jwt.jwt_expiration.value || '24h',
        }
      );

      // Set session data if using express-session
      if (req.session) {
        req.session.userId = user.id;
        req.session.username = user.username;
      }

      log.auth.info('OIDC login successful', {
        provider,
        username: user.username,
        email: user.email,
      });

      return res.redirect(`/auth/callback?token=${encodeURIComponent(token)}`);
    } catch (error) {
      log.auth.error('OIDC callback error', {
        provider,
        error: error.message,
        stack: error.stack,
      });

      // Handle specific error cases
      if (
        error.message.includes('Access denied') ||
        error.message.includes('Invitation required')
      ) {
        return res.redirect('/?error=access_denied');
      }

      return res.redirect('/?error=oidc_failed');
    }
  });

  /**
   * @swagger
   * /api/auth/oidc/{provider}:
   *   get:
   *     summary: Initiate OIDC authentication for specific provider
   *     description: Redirect user to specific OIDC provider for authentication
   *     tags: [Authentication]
   *     parameters:
   *       - in: path
   *         name: provider
   *         required: true
   *         schema:
   *           type: string
   *         description: OIDC provider name
   *         example: "google"
   *     responses:
   *       302:
   *         description: Redirect to OIDC provider
   *       400:
   *         description: OIDC provider not enabled or not found
   *       500:
   *         description: Internal server error
   */
  app.get('/api/auth/oidc/:provider', async (req, res) => {
    const { provider } = req.params;

    try {
      log.auth.info('OIDC authentication request', { provider });

      const authConfig = loadConfig('auth');
      const appConfig = loadConfig('app');

      // Validate provider exists and is enabled
      const providerConfig = authConfig.auth?.oidc?.providers?.[provider];
      if (!providerConfig) {
        log.auth.error('OIDC provider not found', { provider });
        return res.redirect('/?error=provider_not_found');
      }

      if (!providerConfig.enabled?.value) {
        log.auth.error('OIDC provider not enabled', { provider });
        return res.redirect('/?error=provider_not_enabled');
      }

      // Generate security parameters (PKCE + state)
      const state = client.randomState();
      const codeVerifier = client.randomPKCECodeVerifier();
      const returnUrl = req.query.return || '/';

      log.auth.debug('Generated OIDC security parameters', {
        provider,
        hasState: !!state,
        hasCodeVerifier: !!codeVerifier,
        returnUrl,
      });

      // Store in session for callback verification
      if (!req.session) {
        log.auth.error('Session not available for OIDC flow', { provider });
        return res.redirect('/?error=session_not_available');
      }

      req.session.oidcProvider = provider;
      req.session.oidcState = state;
      req.session.oidcCodeVerifier = codeVerifier;
      req.session.oidcReturnUrl = returnUrl;

      log.auth.debug('Stored OIDC session data', {
        provider,
        sessionId: req.sessionID,
      });

      // Generate authorization URL
      const redirectUri = `${appConfig.boxvault.origin.value}/api/auth/oidc/callback`;
      const authUrl = await buildAuthorizationUrl(provider, redirectUri, state, codeVerifier);

      log.auth.info('Redirecting to OIDC provider', {
        provider,
        authUrl: authUrl.toString().substring(0, 100) + '...',
      });

      return res.redirect(authUrl.toString());
    } catch (error) {
      log.auth.error('OIDC start error', {
        provider: req.params.provider,
        error: error.message,
        stack: error.stack,
      });
      return res.redirect('/?error=oidc_failed');
    }
  });

  /**
   * @swagger
   * /api/auth/oidc/logout:
   *   post:
   *     summary: OIDC logout with RP-initiated logout support
   *     description: Logout user and optionally redirect to OIDC provider logout endpoint
   *     tags: [Authentication]
   *     security:
   *       - JwtAuth: []
   *     responses:
   *       200:
   *         description: Logout processed
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                   example: "Logout initiated"
   *                 redirect_url:
   *                   type: string
   *                   description: OIDC provider logout URL (if RP-initiated logout supported)
   *                   example: "https://accounts.google.com/logout?..."
   *       500:
   *         description: Internal server error
   */
  app.post('/api/auth/oidc/logout', (req, res) => {
    const token = req.headers['x-access-token'];

    if (!token) {
      log.auth.info('OIDC logout: No token provided');
      return res.json({
        success: true,
        message: 'No active session to logout',
      });
    }

    try {
      const authConfig = loadConfig('auth');
      const appConfig = loadConfig('app');

      // Verify and decode token
      const decoded = jwt.verify(token, authConfig.auth.jwt.jwt_secret.value);

      log.auth.info('OIDC logout request', {
        userId: decoded.id,
        provider: decoded.provider,
      });

      // Check if this is an OIDC-authenticated user
      if (decoded.provider?.startsWith('oidc-')) {
        const providerName = decoded.provider.replace('oidc-', '');
        const state = client.randomState();
        const postLogoutRedirectUri = `${appConfig.boxvault.origin.value}/login?logout=success`;

        log.auth.info('Attempting RP-initiated logout', {
          provider: providerName,
          postLogoutRedirectUri,
        });

        // Build end session URL for RP-initiated logout
        const endSessionUrl = buildEndSessionUrl(
          providerName,
          postLogoutRedirectUri,
          state,
          decoded.id_token
        );

        if (endSessionUrl) {
          log.auth.info('RP-initiated logout URL generated', {
            provider: providerName,
            url: endSessionUrl.toString().substring(0, 100) + '...',
          });

          return res.json({
            success: true,
            message: 'Logout initiated',
            redirect_url: endSessionUrl.toString(),
          });
        }

        log.auth.info('Provider does not support RP-initiated logout, local logout only', {
          provider: providerName,
        });
      }

      // Local logout only (provider doesn't support RP-initiated logout or not OIDC)
      return res.json({
        success: true,
        message: 'Logged out locally',
      });
    } catch (error) {
      log.auth.error('OIDC logout error', {
        error: error.message,
        stack: error.stack,
      });

      // Even on error, allow local logout
      return res.json({
        success: true,
        message: 'Logged out locally',
      });
    }
  });

  /**
   * @swagger
   * /api/auth/oidc/logout/local:
   *   post:
   *     summary: Local-only logout
   *     description: Logout from BoxVault without triggering OIDC provider logout
   *     tags: [Authentication]
   *     responses:
   *       200:
   *         description: Local logout successful
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                   example: "Logged out locally"
   *       500:
   *         description: Internal server error
   */
  app.post('/api/auth/oidc/logout/local', (req, res) => {
    log.auth.info('Local-only logout requested');
    return res.json({
      success: true,
      message: 'Logged out locally',
    });
  });

  /**
   * @swagger
   * /api/auth/methods:
   *   get:
   *     summary: Get available authentication methods
   *     description: Retrieve list of enabled authentication methods for the login form
   *     tags: [Authentication]
   *     responses:
   *       200:
   *         description: Authentication methods retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 methods:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       id:
   *                         type: string
   *                         description: Method identifier
   *                         example: "local"
   *                       name:
   *                         type: string
   *                         description: Human-readable method name
   *                         example: "Local Account"
   *                       enabled:
   *                         type: boolean
   *                         description: Whether method is enabled
   *                         example: true
   *       500:
   *         description: Internal server error
   */
  app.get('/api/auth/methods', (req, res) => {
    try {
      const authConfig = loadConfig('auth');
      const methods = [];

      // Local authentication
      methods.push({
        id: 'local',
        name: 'Local Account',
        enabled: true,
      });

      // OIDC providers
      const oidcProvidersConfig = authConfig.auth?.oidc?.providers || {};

      Object.entries(oidcProvidersConfig).forEach(([providerName, providerConfig]) => {
        if (providerConfig.enabled?.value && providerConfig.display_name?.value) {
          methods.push({
            id: `oidc-${providerName}`,
            name: providerConfig.display_name.value,
            enabled: true,
          });
        }
      });

      log.auth.debug('Available auth methods', {
        count: methods.length,
        methods: methods.map(m => m.id),
      });

      return res.json({ methods });
    } catch (error) {
      log.auth.error('Get auth methods error', {
        error: error.message,
        stack: error.stack,
      });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  });
};
