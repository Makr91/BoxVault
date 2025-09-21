const { passport } = require("../auth/passport");

module.exports = function(app) {
  app.use(function(req, res, next) {
    res.header(
      "Access-Control-Allow-Headers",
      "x-access-token, Origin, Content-Type, Accept"
    );
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
  app.get("/api/auth/oidc/callback", (req, res, next) => {
    log.app.info('OIDC Callback - Session data:', {
      sessionExists: !!req.session,
      sessionId: req.session?.id,
      oidcProvider: req.session?.oidcProvider,
      allSessionData: req.session
    });

    const provider = req.session?.oidcProvider;

    if (req.session) {
      delete req.session.oidcProvider;
    }

    if (!provider) {
      log.error.error('OIDC Callback - No provider in session, redirecting with error');
      return res.redirect('/?error=no_provider');
    }

    const strategyName = `oidc-${provider}`;
    log.app.info('OIDC Callback - Using strategy:', strategyName);
    
    passport.authenticate(strategyName, {
      session: false,
      failureRedirect: `/?error=oidc_failed&provider=${provider}`,
    })(req, res, (err) => {
      if (err) {
        log.error.error('OIDC callback error:', err.message);
        return res.redirect(`/?error=oidc_failed&provider=${provider}`);
      }

      const user = req.user;
      if (!user) {
        log.error.error('OIDC callback: No user object found');
        return res.redirect(`/?error=oidc_failed&provider=${provider}`);
      }

      const jwt = require("jsonwebtoken");
      const { loadConfig } = require('../utils/config-loader');
      
      let authConfig;
      try {
        authConfig = loadConfig('auth');
      } catch (e) {
        log.error.error(`Failed to load auth configuration: ${e.message}`);
        return res.redirect(`/?error=config_error`);
      }

      const token = jwt.sign(
        { 
          id: user.id,
          isServiceAccount: false,
        },
        authConfig.auth.jwt.jwt_secret.value,
        {
          algorithm: 'HS256',
          allowInsecureKeySizes: true,
          expiresIn: authConfig.auth.jwt.jwt_expiration.value || '24h',
        }
      );

      if (req.session) {
        req.session.userId = user.id;
        req.session.username = user.username;
      }

      log.app.info(`OIDC login successful for provider: ${provider}`);
      res.redirect(`/auth/callback?token=${encodeURIComponent(token)}`);
    });
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
  app.get("/api/auth/oidc/:provider", (req, res, next) => {
    const { provider } = req.params;
    
    log.app.info('OIDC Auth Request - Provider:', provider);
    log.app.info('OIDC Auth Request - Session before:', {
      sessionExists: !!req.session,
      sessionId: req.session?.id
    });
    
    if (!provider) {
      return res.status(400).json({
        message: 'OIDC provider name is required',
      });
    }

    if (req.session) {
      req.session.oidcProvider = provider;
      log.app.info('OIDC Auth Request - Set provider in session:', provider);
    } else {
      log.error.error('OIDC Auth Request - No session available!');
    }

    const strategyName = `oidc-${provider}`;
    log.app.info('OIDC Auth Request - Using strategy:', strategyName);
    passport.authenticate(strategyName)(req, res, next);
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
  app.get("/api/auth/methods", (req, res) => {
    try {
      const { loadConfig } = require('../utils/config-loader');
      let authConfig;
      
      try {
        authConfig = loadConfig('auth');
      } catch (e) {
        log.error.error(`Failed to load auth configuration: ${e.message}`);
        return res.status(500).json({ message: 'Configuration error' });
      }

      const methods = [];

      methods.push({
        id: 'local',
        name: 'Local Account',
        enabled: true,
      });

      if (authConfig.auth?.oidc?.providers) {
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
      }

      res.json({ methods });
    } catch (error) {
      log.error.error('Get auth methods error:', error.message);
      res.status(500).json({ message: 'Internal server error' });
    }
  });
};
