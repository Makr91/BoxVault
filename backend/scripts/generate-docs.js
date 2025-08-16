#!/usr/bin/env node

/**
 * @fileoverview Generate static API documentation for GitHub Pages
 * @description Extracts OpenAPI spec and generates static Swagger UI documentation
 */

const fs = require('fs');
const path = require('path');

// Load swagger configuration - now works correctly since we're in backend context
const { specs } = require('../app/config/swagger.js');

/**
 * Generate static API documentation files
 */
async function generateDocs() {
  console.log('🔧 Generating API documentation...');

  // Ensure docs/api directory exists (relative to project root)
  const docsDir = path.join(__dirname, '../../docs/api');
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  try {
    // Generate OpenAPI JSON spec
    console.log('📝 Writing OpenAPI specification...');
    const openApiJson = JSON.stringify(specs, null, 2);
    fs.writeFileSync(path.join(docsDir, 'openapi.json'), openApiJson);
    console.log('✅ Generated docs/api/openapi.json');

    // Generate static Swagger UI HTML (pure HTML, no Jekyll processing)
    console.log('📝 Generating Swagger UI HTML...');
    const swaggerHtml = generateSwaggerUI();
    fs.writeFileSync(path.join(docsDir, 'swagger-ui.html'), swaggerHtml);
    console.log('✅ Generated docs/api/swagger-ui.html');

    // Generate Jekyll redirect page
    console.log('📝 Generating Jekyll redirect page...');
    const redirectPage = generateRedirectPage();
    fs.writeFileSync(path.join(docsDir, 'reference.md'), redirectPage);
    console.log('✅ Generated docs/api/reference.md');

    console.log('🎉 Documentation generation completed successfully!');
    console.log('');
    console.log('Generated files:');
    console.log('  - docs/api/openapi.json - Raw OpenAPI specification');
    console.log('  - docs/api/swagger-ui.html - Pure HTML Swagger UI (no Jekyll processing)');
    console.log('  - docs/api/reference.md - Jekyll page with embedded Swagger UI');
    console.log('');

  } catch (error) {
    console.error('❌ Error generating documentation:', error.message);
    process.exit(1);
  }
}

/**
 * Generate pure HTML Swagger UI page (no Jekyll processing)
 * @returns {string} Pure HTML content for Swagger UI
 */
function generateSwaggerUI() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BoxVault API Reference</title>
    <link rel="icon" type="image/x-icon" href="/BoxVault/frontend/public/favicon.ico">
    <link rel="apple-touch-icon" sizes="192x192" href="/BoxVault/frontend/public/logo192.png">
    <link rel="apple-touch-icon" sizes="512x512" href="/BoxVault/frontend/public/logo512.png">
    <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.10.5/swagger-ui.css" />
    <style>
        html {
            box-sizing: border-box;
            overflow: -moz-scrollbars-vertical;
            overflow-y: scroll;
        }
        *, *:before, *:after {
            box-sizing: inherit;
        }
        body {
            margin: 0;
            background: #fafafa;
        }
        .swagger-ui .topbar {
            display: none;
        }
        .swagger-ui .scheme-container {
            background: #4f566b;
            box-shadow: 0 1px 2px 0 rgba(0,0,0,.15);
            margin-bottom: 20px;
        }
        
        /* Dark theme to match Just the Docs */
        body {
            background: #1c1c1e !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
        }
        
        .swagger-ui {
            color: #f0f6fc !important;
        }
        
        .swagger-ui .info .title {
            color: #f0f6fc !important;
        }
        
        .swagger-ui .info .description {
            color: #c9d1d9 !important;
        }
        
        /* Fix API description text */
        .swagger-ui .info .description p {
            color: #c9d1d9 !important;
        }
        
        /* Fix server variables section - make it look professional */
        .swagger-ui .scheme-container {
            background: #21262d !important;
            border: 1px solid #30363d !important;
            padding: 16px !important;
            border-radius: 6px !important;
        }
        
        .swagger-ui .scheme-container table {
            width: 100% !important;
            background: transparent !important;
            border-collapse: separate !important;
            border-spacing: 0 !important;
            margin: 0 !important;
        }
        
        .swagger-ui .scheme-container table tr {
            display: flex !important;
            align-items: center !important;
            margin-bottom: 12px !important;
        }
        
        .swagger-ui .scheme-container table tr:last-child {
            margin-bottom: 0 !important;
        }
        
        .swagger-ui .scheme-container table td:first-child {
            /* Label styling - no boxes, just plain text */
            background: transparent !important;
            border: none !important;
            color: #f0f6fc !important;
            padding: 8px 12px 8px 0 !important;
            min-width: 80px !important;
            text-align: left !important;
            font-weight: 400 !important;
            margin-right: 12px !important;
            flex-shrink: 0 !important;
        }
        
        .swagger-ui .scheme-container table td:last-child {
            /* Input field container - no background */
            background: transparent !important;
            border: none !important;
            padding: 0 !important;
            flex: 1 !important;
        }
        
        .swagger-ui .scheme-container select,
        .swagger-ui .scheme-container input {
            background: #21262d !important;
            border: 1px solid #30363d !important;
            color: #f0f6fc !important;
            padding: 8px 12px !important;
            border-radius: 4px !important;
            font-size: 13px !important;
            width: 100% !important;
            box-sizing: border-box !important;
        }
        
        .swagger-ui .scheme-container select:focus,
        .swagger-ui .scheme-container input:focus {
            border-color: #1f6feb !important;
            box-shadow: 0 0 0 2px rgba(31, 111, 235, 0.3) !important;
            outline: none !important;
        }
        
        .swagger-ui .computed-url code {
            background: #21262d !important;
            color: #79c0ff !important;
            border: 1px solid #30363d !important;
        }
        
        /* Fix model/schema tables */
        .swagger-ui table.model {
            background: #0d1117 !important;
            border: 1px solid #30363d !important;
            border-radius: 4px !important;
            margin: 10px 0 !important;
        }
        
        .swagger-ui table.model td {
            background: #0d1117 !important;
            border-color: #30363d !important;
            color: #f0f6fc !important;
            padding: 8px 12px !important;
            border-top: 1px solid #30363d !important;
        }
        
        .swagger-ui table.model .property-row:first-child td {
            border-top: none !important;
        }
        
        .swagger-ui table.model .property-name {
            color: #79c0ff !important;
            font-weight: 600 !important;
        }
        
        .swagger-ui table.model .property-type {
            color: #a5a5a5 !important;
            font-style: italic !important;
        }
        
        .swagger-ui .model-title {
            color: #f0f6fc !important;
        }
        
        .swagger-ui .model-box {
            background: #0d1117 !important;
            border: 1px solid #30363d !important;
            border-radius: 4px !important;
        }
        
        .swagger-ui .model-box-control {
            background: #21262d !important;
            color: #f0f6fc !important;
            border-bottom: 1px solid #30363d !important;
            width: 100% !important;
            padding: 12px 16px !important;
            display: flex !important;
            align-items: center !important;
            cursor: pointer !important;
            font-size: 13px !important;
            border-radius: 4px 4px 0 0 !important;
        }
        
        .swagger-ui .model-box-control:hover {
            background: #30363d !important;
        }
        
        .swagger-ui .model-toggle {
            margin-right: 8px !important;
            font-size: 12px !important;
            display: inline-block !important;
        }
        
        .swagger-ui .model-toggle.collapsed:after {
            content: '▶' !important;
            color: #8b949e !important;
        }
        
        .swagger-ui .model-toggle:not(.collapsed):after {
            content: '▼' !important;
            color: #8b949e !important;
        }
        
        /* Fix all toggle arrows - make them consistent */
        .swagger-ui .model-toggle:before {
            display: none !important;
        }
        
        .swagger-ui .model-toggle {
            color: #8b949e !important;
        }
        
        /* Override any default Swagger UI toggle styling */
        .swagger-ui span.model-toggle {
            color: #8b949e !important;
        }
        
        .swagger-ui span.model-toggle:before {
            display: none !important;
        }
        
        .swagger-ui span.model-toggle:after {
            color: #8b949e !important;
        }
        
        .swagger-ui .model-box {
            width: 100% !important;
            max-width: 100% !important;
        }
        
        .swagger-ui .opblock {
            background: #0d1117 !important;
            border: 1px solid #30363d !important;
        }
        
        .swagger-ui .opblock .opblock-summary {
            border-color: #30363d !important;
        }
        
        .swagger-ui .opblock.opblock-post {
            background: #0d1117 !important;
            border-color: #238636 !important;
        }
        
        .swagger-ui .opblock.opblock-get {
            background: #0d1117 !important;
            border-color: #1f6feb !important;
        }
        
        .swagger-ui .opblock.opblock-put {
            background: #0d1117 !important;
            border-color: #d2a863 !important;
        }
        
        .swagger-ui .opblock.opblock-delete {
            background: #0d1117 !important;
            border-color: #da3633 !important;
        }
        
        .swagger-ui .opblock .opblock-summary-method {
            text-shadow: none !important;
        }
        
        .swagger-ui .btn.authorize {
            background: #238636 !important;
            border-color: #2ea043 !important;
            color: #ffffff !important;
        }
        
        .swagger-ui .btn.authorize:hover {
            background: #2ea043 !important;
        }
        
        .swagger-ui input[type=text], .swagger-ui input[type=password], .swagger-ui input[type=search], .swagger-ui input[type=email], .swagger-ui textarea, .swagger-ui select {
            background: #21262d !important;
            border: 1px solid #30363d !important;
            color: #e6edf3 !important;
        }
        
        .swagger-ui input[type=text]:focus, .swagger-ui input[type=password]:focus, .swagger-ui input[type=search]:focus, .swagger-ui input[type=email]:focus, .swagger-ui textarea:focus, .swagger-ui select:focus {
            border-color: #1f6feb !important;
            box-shadow: 0 0 0 3px rgba(31, 111, 235, 0.3) !important;
        }
    </style>
</head>
<body>
    <div id="swagger-ui"></div>

    <script src="https://unpkg.com/swagger-ui-dist@5.10.5/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@5.10.5/swagger-ui-standalone-preset.js"></script>
    <script>
        window.onload = function() {
            // Begin Swagger UI call region
            const ui = SwaggerUIBundle({
                url: 'openapi.json',
                dom_id: '#swagger-ui',
                deepLinking: true,
                presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIStandalonePreset
                ],
                plugins: [
                    SwaggerUIBundle.plugins.DownloadUrl
                ],
                layout: "StandaloneLayout",
                tryItOutEnabled: true,
                requestInterceptor: function(request) {
                    // Add note about CORS for try-it-out functionality
                    if (request.url.startsWith('http')) {
                        console.log('Note: Try-it-out functionality requires CORS configuration on the API server');
                    }
                    return request;
                }
            });
            // End Swagger UI call region
        };
    </script>
</body>
</html>`;
}

/**
 * Generate Jekyll redirect page that includes the pure HTML Swagger UI
 * @returns {string} Jekyll markdown page with iframe to Swagger UI
 */
function generateRedirectPage() {
  return `---
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
}

// Run the documentation generation
generateDocs().catch(console.error);
