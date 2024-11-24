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

1. **Clone the repository**:
```git clone <repository-url> cd BoxVault```


2. **Install dependencies**:
```
bash

For backend
cd backend npm install

For frontend
cd ../frontend npm install
```

3. **Configure the application**:
   - Update the database configuration in `backend/app/config/db.config.yaml`.
   - Update the authentication configuration in `backend/app/config/auth.config.yaml`.

4. **Run the application**:
bash

Start the backend server
cd backend npm start

Start the frontend development server
cd ../frontend npm start

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

## Future TODOs:

1. Make use of the published/unpublished flag of a box to only show to the user, but not to  others in organization

2. Audit output for Passwords and sensitive data
3. Audit API functionality against packer scripts and vagrant api

4. Production Packaging

5. CI/CD