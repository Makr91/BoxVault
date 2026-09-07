# BoxVault

BoxVault is a cloud-based storage solution for Virtual Machine images and templates, designed to be self-hosted. It provides a platform similar to Vagrant Cloud, allowing organizations to securely store, manage, and share VM templates within their own infrastructure.

## Table of Contents

- [Features](#features)
- [Technologies Used](#technologies-used)
- [Installation](#installation)
- [Usage](#usage)
- [API Endpoints](#api-endpoints)
- [Contributing](#contributing)
- [License](#license)

## Features

- **User Authentication**: Secure login and registration using JWT tokens.
- **VM Template Management**: Upload, update, and delete VM templates within boxes.
- **Box Management**: Create, update, and delete boxes with version control.
- **Organization Management**: Manage users and roles within organizations.
- **Version Control**: Track and manage different versions of VM templates.
- **Role-Based Access**: Platform admin plus per-organization owner, admin, and member roles with specific permissions.
- **Public and Private Boxes**: Control visibility of boxes within the organization.
- **Architecture Management**: Manage architectures and providers for different versions.

## Technologies Used

- **Frontend**: the [STARTcloud UI](https://github.com/STARTcloud/startcloud-ui), one build shared across the estate, fetched as a release artifact and served from `backend/ui`; it renders what `GET /api/status` (`backend/app/controllers/status.controller.js`) advertises: `auth: ["backend"]` while `auth.jwt.local_enabled` is on, or `auth: ["idp"]` with an `idp` object (`issuer`, `clientId`, `scopes`, `storagePrefix`) from the first enabled `auth.oidc.providers` entry while it is off, `collections: ["boxes", "isos"]`, `config: ["app", "auth", "db", "mail"]`, `events: { path: "/api/events", topics: ["session", "notifications"] }` and the feature tokens `local-accounts` (only while `auth.jwt.local_enabled` is on), `setup`, `admin`, `org-console`, `discover`, `invitations`, `uploads`, `watches`, `deploy`, `favorites`, `notifications`, `health`, `footer`, `search`, `events`
- **Backend**: Node.js, Express.js
- **Database**: Sequelize ORM (Database configuration in `db.config.yaml`)
- **Authentication**: JWT tokens
- **File Upload**: Custom middleware for handling file uploads
- **Version Control**: Custom controllers and models for managing versions

## Installation

### Development Installation

1. **Clone the repository**:

   ```bash
   git clone https://github.com/Makr91/BoxVault.git
   cd BoxVault
   ```

2. **Install dependencies and fetch the UI**:

   ```bash
   cd backend
   npm install
   UI_VERSION=$(node -p "require('./package.json').startcloudUiVersion")
   mkdir -p ui
   curl -fsSL "https://github.com/STARTcloud/startcloud-ui/releases/download/v${UI_VERSION}/startcloud-ui-${UI_VERSION}.tar.gz" | tar -xz -C ui
   ```

   The UI version is pinned by `startcloudUiVersion` in `backend/package.json`; every STARTcloud UI release dispatches `dependency-update` here and `.github/workflows/dependency-bump.yml` answers with a `bump/startcloud-ui` pull request for a human to merge.

3. **Configure the application**:
   - Development reads `backend/app/config/<name>.dev.config.yaml` for `app`, `auth`, `db` and `mail`; the CI derives them from `packaging/config/*.yaml`.
   - Production reads `<name>.config.yaml` under `CONFIG_DIR` (default `/etc/boxvault`), the one environment variable BoxVault reads.

4. **Run the application**:

   ```bash
   cd backend
   npm start
   ```

### Production Installation (Debian Package)

BoxVault provides pre-built Debian packages for easy production deployment:

1. **Download the latest release**:

   ```bash
   # Download from GitHub releases
   wget https://github.com/Makr91/BoxVault/releases/latest/download/boxvault_VERSION_amd64.deb
   ```

2. **Install BoxVault**:

   ```bash
   sudo gdebi -n boxvault_VERSION_amd64.deb
   sudo systemctl enable --now boxvault
   sudo systemctl status boxvault
   ```

   SQLite is the packaged database (`database_type: sqlite` in `/etc/boxvault/db.config.yaml`) and needs nothing else; MySQL is optional and configured on the setup page, see the [Installation Guide](docs/guides/installation.md).

3. **Access BoxVault**:
   - Open your browser to `https://localhost` (the package listens on 443 and 80, `boxvault.api_listen_port_encrypted` and `api_listen_port_unencrypted` in `app.config.yaml`)
   - Complete the initial setup with the setup token `postinst` printed (`/etc/boxvault/setup.token`)

For detailed packaging and build instructions, see [packaging/README.md](packaging/README.md).

## Usage

- **Register**: Create a new account.
- **Login**: Access your account using your credentials.
- **Create Box**: Create a new box to store VM templates.
- **Upload VM Templates**: Upload VM templates to a specific box.
- **Manage Versions**: Add, update, or delete versions of VM templates.
- **Manage Organizations**: Administer users and roles within your organization.

## API Endpoints

### Authentication

- `POST /api/auth/signup`: Register a new user.
- `POST /api/auth/signin`: Login a user.

### Boxes

- `GET /api/organization/:organization/box`: Retrieve the boxes of an organization.
- `GET /api/organization/:organization/box/:name`: Retrieve a box.
- `POST /api/organization/:organization/box`: Create a new box.
- `PUT /api/organization/:organization/box/:name`: Update a box.
- `DELETE /api/organization/:organization/box/:name`: Delete a box.

### Files

- `POST /api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/upload`: Upload a file.
- `DELETE /api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/delete`: Delete a file.

### Organizations

- `GET /api/organization`: Retrieve the organizations of the caller.
- `POST /api/organization`: Create a new organization.
- `GET /api/organizations/discover`: Retrieve the discoverable organizations.

### Events

- `GET /api/events?topics=session,notifications`: The one server-sent event stream of the universal events contract; `session` sends `session-terminated`, `notifications` sends `unread-count`.

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create a new branch (`git checkout -b feature/your-feature-name`).
3. Commit your changes (`git commit -m 'Add some feature'`).
4. Push to the branch (`git push origin feature/your-feature-name`).
5. Open a pull request.

## License

This project is licensed under the GPL-3.0 License. See the [LICENSE.md](LICENSE.md) file for details.
