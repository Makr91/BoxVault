# Security Policy

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in BoxVault, please report it responsibly:

### Preferred Method: Security Advisory

1. Go to the [GitHub Security Advisory page](https://github.com/Makr91/BoxVault/security/advisories)
2. Click "Report a vulnerability"
3. Fill out the advisory form with detailed information
4. Submit the advisory

### What to Include

Please provide as much information as possible:

- **Description** of the vulnerability
- **Steps to reproduce** the issue
- **Potential impact** of the vulnerability
- **Affected versions** (if known)
- **Suggested fix** (if you have one)
- **Your contact information** for follow-up questions

## Response Process

Due to limited development resources, please understand that:

- **Initial Response**: We aim to acknowledge receipt within 48-72 hours
- **Assessment**: Initial assessment will be completed within 1 week
- **Resolution**: Timeline depends on severity and complexity, typically 1-4 weeks
- **Disclosure**: Coordinated disclosure after fix is available

### Severity Levels

- **Critical**: Immediate attention (RCE, privilege escalation)
- **High**: Quick response needed (authentication bypass, data exposure)
- **Medium**: Standard timeline (DoS, information disclosure)
- **Low**: Lower priority (minor information leaks)

## Security Considerations for BoxVault

Given that BoxVault manages Vagrant box repositories and file uploads, please pay special attention to:

### High-Risk Areas

- **Credential Handling**: Bypasses of the session JWT, identity-provider token or service-account key checks, or privilege escalation through a service account
- **Organization Scoping**: Reads or writes that cross an organization boundary
- **File System Operations**: Path traversal or unauthorized file access in box, ISO and artwork uploads and downloads
- **Command Execution**: Any potential for command injection, the OpenSSL certificate generation included
- **Provisioning and Setup**: The SCIM receiver at `/scim/v2` and the setup-token routes

### Configuration Security

- **Default Configurations**: Insecure defaults
- **SSL/TLS Implementation**: Certificate validation, cipher suites
- **CORS Configuration**: Origin validation bypasses
- **Database Security**: SQL injection, unauthorized access

## Best Practices for Users

To maintain security:

1. **Keep Updated**: Always run the latest stable version
2. **Secure Configuration**: Follow the [security configuration guide](/docs/configuration/)
3. **API Key Management**: Rotate API keys regularly, use strong keys
4. **Network Security**: Use HTTPS, restrict network access appropriately
5. **Monitor Logs**: Watch for suspicious activity in application logs

## Security Features

BoxVault includes several security features:

- **Request Authentication**: One resolver under every gate, in the order BoxVault session JWT on `x-access-token` (HS256, signed with `auth.jwt.jwt_secret`, carrying the configured issuer and audience), identity-provider access token on `Authorization` (`Bearer`, or `DPoP` with a proof for a key-bound token, verified against the provider's JWKS and `auth.resource_server.audience`, only while `auth.resource_server.enabled` is on), then raw service-account key on `Authorization: Bearer` or `x-access-token`; the refresh route takes the session JWT alone
- **Service-Account Keys**: 32 random bytes, returned once at creation and stored as sha256 hex hashes; every key expires (`expiration_days`, capped by `auth.jwt.service_account_max_expiry_days`) and stops working when its creator is suspended
- **Local Passwords**: bcrypt at `auth.local.local_bcrypt_rounds`, at least 15 characters by default, a blocklist of common passwords, and email verification before sign-in
- **Session Revocation**: A user's session tokens issued before `sessionsInvalidAfter` are refused
- **Rate Limiting**: A global limiter (`rate_limiting.max_requests` per `rate_limiting.window_minutes`) plus separate limiters for file operations, downloads, download links, architecture operations and the SPA fallback
- **Input Validation**: JSON Schema rules served at `GET /api/rules` and evaluated by `validateBody` on every write route; a refused write is `application/problem+json` with pointers
- **CORS Protection**: An allowlist of `boxvault.origin` and `boxvault.allowed_origins`
- **CSRF**: The API is authenticated by headers a cross-site page cannot set; the OIDC session routes carry lusca CSRF checks
- **SSL/TLS Support**: TLS 1.2 and 1.3 with a self-signed pair generated when none exists, uploaded certificates, and a Certbot deploy hook
- **Setup Token**: 64 hex characters at `0600`, compared in constant time and deleted once setup completes
- **Configuration Files**: `/etc/boxvault/*.config.yaml` are `0600`, owned by the `boxvault` service user, and every write is validated against a schema before it lands
- **Request Logging**: Every request is logged with method, path, status and duration; there is no per-key usage tracking or audit trail

## Acknowledgments

We appreciate the security research community's efforts in making BoxVault more secure. Responsible disclosure helps protect all users.

### Hall of Fame

Contributors who responsibly report security vulnerabilities will be acknowledged here (with their permission):

- _No vulnerabilities reported yet_

## Updates to This Policy

This security policy may be updated as the project evolves. Check back periodically for changes.

---

**Remember**: Security is a shared responsibility. Your vigilance and responsible reporting help keep the entire BoxVault community safe.
