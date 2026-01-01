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
- **Role-Based Access**: Admin, moderator, and provider roles with specific permissions.
- **Public and Private Boxes**: Control visibility of boxes within the organization.
- **Architecture Management**: Manage architectures and providers for different versions.

## Technologies Used

- **Frontend**: React.js
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

2. **Install dependencies**:

   ```bash
   # For backend
   cd backend
   npm install

   # For frontend
   cd ../frontend
   npm install
   ```

3. **Configure the application**:
   - Update the database configuration in `backend/app/config/db.config.yaml`.
   - Update the authentication configuration in `backend/app/config/auth.config.yaml`.

4. **Run the application**:

   ```bash
   # Start the backend server
   cd backend
   npm start

   # Start the frontend development server
   cd ../frontend
   npm start
   ```

### Production Installation (Debian Package)

BoxVault provides pre-built Debian packages for easy production deployment:

1. **Download the latest release**:

   ```bash
   # Download from GitHub releases
   wget https://github.com/Makr91/BoxVault/releases/latest/download/ boxvault_VERSION_amd64.deb
   ```

2. **Install prerequisites**:

   ```bash
   # Install MySQL/MariaDB
   sudo apt install mysql-server
   # OR
   sudo apt install mariadb-server

   # Create database and user
   sudo mysql -e "CREATE DATABASE boxvault;"
   sudo mysql -e "CREATE USER 'boxvault'@'localhost' IDENTIFIED BY 'your_password';"
   sudo mysql -e "GRANT ALL PRIVILEGES ON boxvault.* TO 'boxvault'@'localhost';"
   sudo mysql -e "FLUSH PRIVILEGES;"
   ```

3. **Install BoxVault**:

   ```bash
   # Install the package
   sudo gdebi -n boxvault_VERSION_amd64.deb

   # Configure database connection
   sudo nano /etc/boxvault/db.config.yaml

   # Start the service
   sudo systemctl enable --now boxvault

   # Check status
   sudo systemctl status boxvault
   ```

4. **Access BoxVault**:
   - Open your browser to `http://localhost:3000`
   - Complete the initial setup

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

- `GET /api/boxes`: Retrieve all boxes.
- `POST /api/boxes`: Create a new box.
- `PUT /api/boxes/:id`: Update a box.
- `DELETE /api/boxes/:id`: Delete a box.

### Files

- `POST /api/files/upload`: Upload a file.
- `DELETE /api/files/:id`: Delete a file.

### Organizations

- `GET /api/organizations`: Retrieve all organizations.
- `POST /api/organizations`: Create a new organization.

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create a new branch (`git checkout -b feature/your-feature-name`).
3. Commit your changes (`git commit -m 'Add some feature'`).
4. Push to the branch (`git push origin feature/your-feature-name`).
5. Open a pull request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
