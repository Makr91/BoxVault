#!/usr/bin/env node

/**
 * @fileoverview Generate static API documentation for GitHub Pages
 * @description Extracts OpenAPI spec and generates static Swagger UI documentation
 */

const fs = require('fs');
const path = require('path');
const { log } = require('../app/utils/Logger.js');

// Load swagger configuration - now works correctly since we're in backend context
const { specs } = require('../app/config/swagger.js');

/**
 * Generate pure HTML Swagger UI page (no Jekyll processing)
 * @returns {string} Pure HTML content for Swagger UI
 */
const generateSwaggerUI = () =>
  `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BoxVault API Reference</title>
    <link rel="icon" type="image/x-icon" href="/frontend/public/favicon.ico">
    <link rel="apple-touch-icon" sizes="192x192" href="/frontend/public/logo192.png">
    <link rel="apple-touch-icon" sizes="512x512" href="/frontend/public/logo512.png">
    <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.10.5/swagger-ui.css" />
    <style>
        html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
        *, *:before, *:after { box-sizing: inherit; }
        body { margin: 0; background: #1c1c1e !important; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
        .swagger-ui { color: #f0f6fc !important; }
        .swagger-ui .topbar { display: none; }
        .swagger-ui .info .title { color: #f0f6fc !important; }
        .swagger-ui .info .description { color: #c9d1d9 !important; }
        .swagger-ui .info .description p { color: #c9d1d9 !important; }
        .swagger-ui .scheme-container { background: #21262d !important; border: 1px solid #30363d !important; padding: 16px !important; border-radius: 6px !important; }
        .swagger-ui .opblock { background: #0d1117 !important; border: 1px solid #30363d !important; }
        .swagger-ui .opblock .opblock-summary { border-color: #30363d !important; }
        .swagger-ui .opblock.opblock-post { border-color: #238636 !important; }
        .swagger-ui .opblock.opblock-get { border-color: #1f6feb !important; }
        .swagger-ui .opblock.opblock-put { border-color: #d2a863 !important; }
        .swagger-ui .opblock.opblock-delete { border-color: #da3633 !important; }
        .swagger-ui .btn.authorize { background: #238636 !important; border-color: #2ea043 !important; color: #ffffff !important; }
        .swagger-ui .btn.authorize:hover { background: #2ea043 !important; }
        .swagger-ui input, .swagger-ui textarea, .swagger-ui select { background: #21262d !important; border: 1px solid #30363d !important; color: #e6edf3 !important; }
        .swagger-ui input:focus, .swagger-ui textarea:focus, .swagger-ui select:focus { border-color: #1f6feb !important; box-shadow: 0 0 0 3px rgba(31, 111, 235, 0.3) !important; }
    </style>
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5.10.5/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@5.10.5/swagger-ui-standalone-preset.js"></script>
    <script>
        window.onload = function() {
            SwaggerUIBundle({
                url: 'openapi.json',
                dom_id: '#swagger-ui',
                deepLinking: true,
                presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
                plugins: [SwaggerUIBundle.plugins.DownloadUrl],
                layout: "StandaloneLayout",
                tryItOutEnabled: true
            });
        };
    </script>
</body>
</html>`;

/**
 * Generate Jekyll redirect page that includes the pure HTML Swagger UI
 * @returns {string} Jekyll markdown page with iframe to Swagger UI
 */
const generateRedirectPage = () =>
  `---
title: API Reference
layout: default
nav_order: 2
parent: API Reference
permalink: /docs/api/reference/
---

# Interactive API Reference

<div style="width: 100%; height: 800px; border: none; margin: 0; padding: 0;">
  <iframe 
    src="swagger-ui.html" 
    style="width: 100%; height: 100%; border: none; background: white;" 
    title="BoxVault API Reference">
    <p>Your browser does not support iframes. 
       <a href="swagger-ui.html">Click here to view the API documentation</a>
    </p>
  </iframe>
</div>

## Alternative Formats

- **[View Full Screen](swagger-ui.html)** - Open Swagger UI in a new page for better experience
- **[Download OpenAPI Spec](openapi.json)** - Raw OpenAPI 3.0 specification file

---

*The interactive API documentation above allows you to explore all available endpoints, view request/response schemas, and test API calls directly from your browser.*
`;

/**
 * Generate static API documentation files
 */
const generateDocs = () => {
  log.app.info('🔧 Generating API documentation...');

  const docsDir = path.join(__dirname, '../../docs/api');
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  try {
    log.app.info('📝 Writing OpenAPI specification...');
    const openApiJson = JSON.stringify(specs, null, 2);
    fs.writeFileSync(path.join(docsDir, 'openapi.json'), openApiJson);
    log.app.info('✅ Generated docs/api/openapi.json');

    log.app.info('📝 Generating Swagger UI HTML...');
    const swaggerHtml = generateSwaggerUI();
    fs.writeFileSync(path.join(docsDir, 'swagger-ui.html'), swaggerHtml);
    log.app.info('✅ Generated docs/api/swagger-ui.html');

    log.app.info('📝 Generating Jekyll redirect page...');
    const redirectPage = generateRedirectPage();
    fs.writeFileSync(path.join(docsDir, 'reference.md'), redirectPage);
    log.app.info('✅ Generated docs/api/reference.md');

    log.app.info('🎉 Documentation generation completed successfully!');
    log.app.info('');
    log.app.info('Generated files:');
    log.app.info('  - docs/api/openapi.json - Raw OpenAPI specification');
    log.app.info('  - docs/api/swagger-ui.html - Pure HTML Swagger UI (no Jekyll processing)');
    log.app.info('  - docs/api/reference.md - Jekyll page with embedded Swagger UI');
    log.app.info('');
  } catch (error) {
    log.error.error('❌ Error generating documentation:', error.message);
    process.exitCode = 1;
  }
};

// Run the documentation generation
generateDocs();
