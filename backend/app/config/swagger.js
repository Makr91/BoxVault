import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const { version } = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'));

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'BoxVault API',
      version,
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
            description: 'The protocol used to access the server',
          },
          host: {
            default: 'localhost:3000',
            description: 'The hostname and port of the server',
          },
        },
      },
    ],
    components: {
      securitySchemes: {
        JwtAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-access-token',
          description:
            'The BoxVault session JWT, minted by POST /api/auth/signin or the OIDC code exchange, sent as the x-access-token header. It is not accepted on the Authorization header.',
        },
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description:
            'Authorization: Bearer carries either an access token of a configured identity provider (verified against its JWKS while auth.resource_server.enabled is on; a key-bound token uses the DPoP scheme with a proof) or a raw service-account key. A BoxVault session JWT presented here is refused.',
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
                enum: ['user', 'admin'],
              },
              description: 'Global user roles (per-organization roles live in UserOrg)',
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
              minLength: 15,
              maxLength: 128,
              description:
                'Password, at least the configured minimum (15 by default) and at most 128 characters',
              example: 'a long passphrase with spaces',
            },
            name: {
              type: 'string',
              maxLength: 255,
              description: 'Optional display name',
              example: 'New User',
            },
            invitation_token: {
              type: 'string',
              description: 'Optional invitation token for joining an organization',
            },
          },
        },
        Problem: {
          type: 'object',
          description:
            'RFC 9457 problem details, the body of every refused write and every failed read, sent as application/problem+json',
          required: ['type', 'title', 'status', 'errors'],
          properties: {
            type: {
              type: 'string',
              format: 'uri',
              description:
                'A URI under https://auth.startcloud.com/probs/: validation, conflict, bad-request, authentication, forbidden, not-found, payload-too-large, throttled, internal or send-failed (a 503 carrying Retry-After)',
              example: 'https://auth.startcloud.com/probs/validation',
            },
            title: {
              type: 'string',
              description: 'The human summary of the type',
              example: 'The request did not pass validation.',
            },
            status: {
              type: 'integer',
              description: 'The HTTP status of this occurrence',
              example: 422,
            },
            errors: {
              type: 'array',
              description: 'One entry per failing value',
              items: {
                type: 'object',
                required: ['pointer', 'rule', 'params', 'detail'],
                properties: {
                  pointer: {
                    type: 'string',
                    description: 'RFC 6901 JSON Pointer into the request body as sent',
                    example: '/name',
                  },
                  rule: {
                    type: 'string',
                    description:
                      'The JSON Schema keyword that failed, or unique, checksum, blocklist, writable or reachable',
                    example: 'pattern',
                  },
                  params: {
                    type: 'object',
                    description:
                      'The keyword value the message needs: { minLength }, { pattern } as the $defs name, { scope } on unique',
                    example: { pattern: 'slug' },
                  },
                  detail: {
                    type: 'string',
                    description:
                      'The host sentence for logs and other clients, never shown by the UI',
                    example: 'name must match slug',
                  },
                },
              },
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
              maxLength: 255,
              description: 'Short one-line box description',
              example: 'Ubuntu 22.04 LTS',
              nullable: true,
            },
            readme: {
              type: 'string',
              description: 'Box README (markdown)',
              nullable: true,
            },
            metadata: {
              type: 'object',
              description:
                'Structured box facts pushed by the build pipeline (whitelisted top-level keys only)',
              nullable: true,
            },
            artwork: {
              type: 'string',
              description: "Stored artwork filename (e.g. 'artwork.svg')",
              example: 'artwork.svg',
              nullable: true,
            },
            published: {
              type: 'boolean',
              description: 'Whether the box is published (visible beyond its owner)',
              example: true,
            },
            isPublic: {
              type: 'boolean',
              description: 'Whether the box is publicly accessible without authentication',
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
            releaseNotes: {
              type: 'string',
              description: 'Version release notes',
              nullable: true,
            },
            deprecated: {
              type: 'boolean',
              description: 'Whether the version is deprecated',
              example: false,
            },
            deprecationReason: {
              type: 'string',
              maxLength: 512,
              description: 'Why the version is deprecated',
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
            org_code: {
              type: 'string',
              maxLength: 6,
              pattern: '^[0-9A-F]{6}$',
              description: '6-character hexadecimal organization code',
              example: 'A55D94',
              nullable: true,
            },
            access_mode: {
              type: 'string',
              enum: ['private', 'invite_only', 'request_to_join'],
              description: 'Organization visibility and access mode',
              example: 'private',
            },
            default_role: {
              type: 'string',
              enum: ['member', 'admin'],
              description: 'Default role for new members',
              example: 'user',
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
              description:
                'Raw authentication token. Returned ONLY in the creation response; stored hashed and never retrievable afterwards.',
              writeOnly: true,
              example: 'abc123def456...',
            },
            description: {
              type: 'string',
              description: 'Service account description',
              example: 'CI/CD automation account',
            },
            role: {
              type: 'string',
              enum: ['member', 'admin', 'owner', 'superadmin'],
              description:
                'Stored role. member, admin and owner act inside the organization only, at the lower of this role and the creator’s current role there; superadmin acts as a global admin on every organization while its creator keeps ROLE_ADMIN.',
              example: 'member',
            },
            expiresAt: {
              type: 'string',
              format: 'date-time',
              description: 'Token expiration timestamp',
              example: '2025-02-04T17:18:00.324Z',
            },
            last_used_at: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description:
                'When a raw key or session JWT of this service account was last accepted; null until its first use',
              example: '2025-01-20T08:41:12.004Z',
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
          required: ['organization_id'],
          properties: {
            description: {
              type: 'string',
              description: 'Description of the service account purpose',
              example: 'CI/CD automation account',
            },
            expiration_days: {
              type: 'integer',
              minimum: 1,
              maximum: 365,
              description:
                'Number of days until token expires, at most auth.jwt.service_account_max_expiry_days',
              example: 30,
            },
            organization_id: {
              type: 'integer',
              description: 'Organization ID to scope the service account to',
              example: 1,
            },
            role: {
              type: 'string',
              enum: ['member', 'admin', 'owner', 'superadmin'],
              default: 'member',
              description:
                'Role of the account, at most the creator’s own role in the organization; superadmin only for a global admin. Absent means member.',
              example: 'member',
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
        RestartEntry: {
          type: 'object',
          required: ['pointer', 'title', 'reason'],
          properties: {
            pointer: {
              type: 'string',
              description: 'RFC 6901 pointer of the changed key',
              example: '/boxvault/api_listen_port_encrypted',
            },
            title: {
              type: 'string',
              description: "The key's title from its schema",
              example: 'HTTPS port',
            },
            reason: {
              type: 'string',
              description: 'Why the key needs a restart, from its schema',
              example: 'the listener is bound at boot',
            },
          },
        },
        ConfigSaved: {
          type: 'object',
          required: ['message', 'requires_restart'],
          properties: {
            message: {
              type: 'string',
              example: 'Configuration saved.',
            },
            requires_restart: {
              type: 'array',
              description: 'The changed keys that need a restart; empty when none',
              items: { $ref: '#/components/schemas/RestartEntry' },
            },
          },
        },
        RestartStatus: {
          type: 'object',
          required: [
            'restart_required',
            'requires_restart',
            'last_modified_by',
            'last_modified_time',
          ],
          properties: {
            restart_required: {
              type: 'boolean',
              description: 'True exactly when the list is not empty',
            },
            requires_restart: {
              type: 'array',
              description: 'The union of every write since the last restart',
              items: { $ref: '#/components/schemas/RestartEntry' },
            },
            last_modified_by: {
              type: 'string',
              nullable: true,
              description: 'The last actor; null until the first write of the process',
            },
            last_modified_time: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'RFC 3339 instant in UTC; null until the first write of the process',
            },
          },
        },
        ConfigUpdateRequest: {
          type: 'object',
          required: ['configs'],
          properties: {
            configs: {
              type: 'object',
              description: 'One JSON Merge Patch per file name',
              additionalProperties: {
                type: 'object',
                description: 'The merge patch over the raw file',
              },
              example: {
                app: {
                  boxvault: {
                    origin: 'https://boxvault.example.com',
                  },
                },
                db: {
                  database_type: 'sqlite',
                },
              },
            },
          },
        },
        ConfigResponse: {
          type: 'object',
          properties: {
            configs: {
              type: 'object',
              description: 'The raw files by name',
              additionalProperties: {
                type: 'object',
                description: 'One raw file parsed to JSON',
              },
            },
          },
        },
        MailTestRequest: {
          type: 'object',
          description:
            "The mail section's form values under their keys, unsaved; any key omitted keeps its stored value",
          properties: {
            smtp_connect: {
              type: 'object',
              additionalProperties: true,
              example: { host: 'smtp.example.com', port: 587, secure: true },
            },
            smtp_settings: {
              type: 'object',
              additionalProperties: true,
              example: { from: 'noreply@example.com' },
            },
            smtp_auth: {
              type: 'object',
              additionalProperties: true,
              example: { user: 'mailer', password: 'secret' },
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
  apis: [
    './app/controllers/**/*.js',
    './app/routes/**/*.js',
    './app/models/**/*.js',
    './app/config/config-engine.js',
  ],
};

const specs = swaggerJsdoc(options);

export default { specs, swaggerUi };
