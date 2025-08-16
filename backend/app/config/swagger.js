const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'BoxVault API',
      version: '0.7.2',
      description: 'API for BoxVault - Vagrant Box Repository Management System',
      license: {
        name: 'GPL-3.0',
        url: 'https://www.gnu.org/licenses/gpl-3.0.html',
      },
      contact: {
        name: 'BoxVault Project',
        url: 'https://github.com/Makr91/BoxVault',
      },
    },
    servers: [
      {
        url: '{protocol}://{host}',
        description: 'Current server',
        variables: {
          protocol: {
            enum: ['http', 'https'],
            default: 'http',
            description: 'The protocol used to access the server'
          },
          host: {
            default: 'localhost:3000',
            description: 'The hostname and port of the server'
          }
        }
      }
    ],
    components: {
      securitySchemes: {
        JwtAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token authentication. First login at [/api/auth/signin](./api/auth/signin) to get your JWT token, then use format: Bearer <jwt_token>',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'Unique user identifier',
              example: 1,
            },
            username: {
              type: 'string',
              description: 'Username',
              example: 'john_admin',
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address',
              example: 'john@example.com',
            },
            roles: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['user', 'moderator', 'admin'],
              },
              description: 'User roles/permissions',
              example: ['user', 'admin'],
            },
            organizationId: {
              type: 'integer',
              description: 'Organization ID',
              example: 1,
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Account creation timestamp',
              example: '2025-01-04T17:18:00.324Z',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Last update timestamp',
              example: '2025-01-04T17:19:19.921Z',
            },
          },
        },
        SigninRequest: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: {
              type: 'string',
              description: 'Username or email address',
              example: 'john_admin',
            },
            password: {
              type: 'string',
              description: 'User password',
              example: 'securePassword123',
            },
          },
        },
        SigninResponse: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'User ID',
              example: 1,
            },
            username: {
              type: 'string',
              description: 'Username',
              example: 'john_admin',
            },
            email: {
              type: 'string',
              description: 'User email',
              example: 'john@example.com',
            },
            roles: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'User roles',
              example: ['ROLE_USER', 'ROLE_ADMIN'],
            },
            accessToken: {
              type: 'string',
              description: 'JWT authentication token',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
          },
        },
        SignupRequest: {
          type: 'object',
          required: ['username', 'email', 'password'],
          properties: {
            username: {
              type: 'string',
              description: 'Desired username',
              example: 'new_user',
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address',
              example: 'new_user@example.com',
            },
            password: {
              type: 'string',
              minLength: 6,
              description: 'Password (minimum 6 characters)',
              example: 'securePassword123',
            },
            organizationId: {
              type: 'integer',
              description: 'Organization ID to join',
              example: 1,
            },
          },
        },
        Box: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'Unique box identifier',
              example: 1,
            },
            name: {
              type: 'string',
              description: 'Box name',
              example: 'ubuntu-server',
            },
            description: {
              type: 'string',
              description: 'Box description',
              example: 'Ubuntu Server 22.04 LTS base box',
              nullable: true,
            },
            shortDescription: {
              type: 'string',
              description: 'Short description',
              example: 'Ubuntu 22.04 LTS',
              nullable: true,
            },
            isPrivate: {
              type: 'boolean',
              description: 'Whether the box is private to the organization',
              example: false,
            },
            organizationId: {
              type: 'integer',
              description: 'Organization ID that owns the box',
              example: 1,
            },
            userId: {
              type: 'integer',
              description: 'User ID of the box creator',
              example: 1,
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Box creation timestamp',
              example: '2025-01-04T17:18:00.324Z',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Last update timestamp',
              example: '2025-01-04T17:19:19.921Z',
            },
          },
        },
        Version: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'Unique version identifier',
              example: 1,
            },
            version: {
              type: 'string',
              description: 'Version number',
              example: '1.0.0',
            },
            description: {
              type: 'string',
              description: 'Version description',
              example: 'Initial release with basic Ubuntu setup',
              nullable: true,
            },
            boxId: {
              type: 'integer',
              description: 'Box ID this version belongs to',
              example: 1,
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Version creation timestamp',
              example: '2025-01-04T17:18:00.324Z',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Last update timestamp',
              example: '2025-01-04T17:19:19.921Z',
            },
          },
        },
        Organization: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'Unique organization identifier',
              example: 1,
            },
            name: {
              type: 'string',
              description: 'Organization name',
              example: 'Acme Corporation',
            },
            description: {
              type: 'string',
              description: 'Organization description',
              example: 'Technology company specializing in virtual infrastructure',
              nullable: true,
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Organization creation timestamp',
              example: '2025-01-04T17:18:00.324Z',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Last update timestamp',
              example: '2025-01-04T17:19:19.921Z',
            },
          },
        },
        Provider: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'Unique provider identifier',
              example: 1,
            },
            name: {
              type: 'string',
              description: 'Provider name',
              example: 'virtualbox',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Provider creation timestamp',
              example: '2025-01-04T17:18:00.324Z',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Last update timestamp',
              example: '2025-01-04T17:19:19.921Z',
            },
          },
        },
        Architecture: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'Unique architecture identifier',
              example: 1,
            },
            name: {
              type: 'string',
              description: 'Architecture name',
              example: 'amd64',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Architecture creation timestamp',
              example: '2025-01-04T17:18:00.324Z',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Last update timestamp',
              example: '2025-01-04T17:19:19.921Z',
            },
          },
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Success message',
              example: 'Operation completed successfully',
            },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Error message',
              example: 'Authentication required',
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Error message',
              example: 'Authentication required',
            },
          },
        },
        File: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'Unique file identifier',
              example: 1,
            },
            filename: {
              type: 'string',
              description: 'Original filename',
              example: 'ubuntu-server.box',
            },
            size: {
              type: 'integer',
              description: 'File size in bytes',
              example: 1073741824,
            },
            checksum: {
              type: 'string',
              description: 'File checksum',
              example: 'sha256:abc123...',
            },
            uploadedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Upload timestamp',
              example: '2025-01-04T17:18:00.324Z',
            },
          },
        },
        BoxWithDetails: {
          type: 'object',
          allOf: [
            { $ref: '#/components/schemas/Box' },
            {
              type: 'object',
              properties: {
                versions: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Version' },
                  description: 'Box versions',
                },
                organization: {
                  $ref: '#/components/schemas/Organization',
                  description: 'Organization details',
                },
              },
            },
          ],
        },
        BoxWithFullDetails: {
          type: 'object',
          allOf: [
            { $ref: '#/components/schemas/BoxWithDetails' },
            {
              type: 'object',
              properties: {
                providers: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Provider' },
                  description: 'Available providers',
                },
                architectures: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Architecture' },
                  description: 'Available architectures',
                },
              },
            },
          ],
        },
        VagrantMetadata: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Box name',
              example: 'ubuntu-server',
            },
            description: {
              type: 'string',
              description: 'Box description',
              example: 'Ubuntu Server 22.04 LTS',
            },
            versions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  version: {
                    type: 'string',
                    example: '1.0.0',
                  },
                  providers: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: {
                          type: 'string',
                          example: 'virtualbox',
                        },
                        url: {
                          type: 'string',
                          example: 'https://example.com/box.box',
                        },
                        checksum_type: {
                          type: 'string',
                          example: 'sha256',
                        },
                        checksum: {
                          type: 'string',
                          example: 'abc123...',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        OrganizationWithUsers: {
          type: 'object',
          allOf: [
            { $ref: '#/components/schemas/Organization' },
            {
              type: 'object',
              properties: {
                users: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/User' },
                  description: 'Organization users',
                },
              },
            },
          ],
        },
        ServiceAccount: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'Unique service account identifier',
              example: 1,
            },
            username: {
              type: 'string',
              description: 'Service account username',
              example: 'john_admin-a1b2c3d4',
            },
            token: {
              type: 'string',
              description: 'Service account authentication token (write-only)',
              writeOnly: true,
              example: 'abc123def456...',
            },
            description: {
              type: 'string',
              description: 'Service account description',
              example: 'CI/CD automation account',
            },
            expiresAt: {
              type: 'string',
              format: 'date-time',
              description: 'Token expiration timestamp',
              example: '2025-02-04T17:18:00.324Z',
            },
            userId: {
              type: 'integer',
              description: 'ID of the user who created this service account',
              example: 1,
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Service account creation timestamp',
              example: '2025-01-04T17:18:00.324Z',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Last update timestamp',
              example: '2025-01-04T17:19:19.921Z',
            },
          },
        },
        ServiceAccountCreateRequest: {
          type: 'object',
          required: ['description', 'expirationDays'],
          properties: {
            description: {
              type: 'string',
              description: 'Description of the service account purpose',
              example: 'CI/CD automation account',
            },
            expirationDays: {
              type: 'integer',
              minimum: 1,
              maximum: 365,
              description: 'Number of days until token expires',
              example: 30,
            },
          },
        },
        SetupTokenRequest: {
          type: 'object',
          required: ['token'],
          properties: {
            token: {
              type: 'string',
              description: 'Setup authorization token',
              example: 'setup-token-abc123',
            },
          },
        },
        SetupTokenResponse: {
          type: 'object',
          properties: {
            authorizedSetupToken: {
              type: 'string',
              description: 'Authorized setup token for subsequent requests',
              example: 'setup-token-abc123',
            },
          },
        },
        ConfigUpdateRequest: {
          type: 'object',
          properties: {
            configs: {
              type: 'object',
              description: 'Configuration updates organized by config type',
              additionalProperties: {
                type: 'object',
                description: 'Configuration values for a specific config type',
              },
              example: {
                app: {
                  boxvault: {
                    api_url: { value: 'https://api.example.com' }
                  }
                },
                db: {
                  sql: {
                    dialect: { value: 'postgres' }
                  }
                }
              },
            },
          },
        },
        ConfigResponse: {
          type: 'object',
          properties: {
            configs: {
              type: 'object',
              description: 'Current configuration values',
              additionalProperties: {
                type: 'object',
                description: 'Configuration section',
              },
            },
          },
        },
        GravatarConfigResponse: {
          type: 'object',
          properties: {
            gravatar: {
              type: 'object',
              description: 'Gravatar configuration settings',
              properties: {
                enabled: {
                  type: 'boolean',
                  description: 'Whether Gravatar is enabled',
                  example: true,
                },
                default: {
                  type: 'string',
                  description: 'Default Gravatar image type',
                  example: 'identicon',
                },
              },
            },
          },
        },
        MailTestRequest: {
          type: 'object',
          required: ['testEmail'],
          properties: {
            testEmail: {
              type: 'string',
              format: 'email',
              description: 'Email address to send test message to',
              example: 'test@example.com',
            },
          },
        },
        MailTestResponse: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Success message',
              example: 'Test email sent successfully',
            },
            messageId: {
              type: 'string',
              description: 'SMTP message ID',
              example: '<abc123@example.com>',
            },
          },
        },
      },
    },
    security: [
      {
        JwtAuth: [],
      },
    ],
  },
  apis: ['./app/controllers/*.js', './app/routes/*.js', './app/models/*.js'], // paths to files containing OpenAPI definitions
};

const specs = swaggerJsdoc(options);

module.exports = { specs, swaggerUi };
