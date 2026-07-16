# Certificate Vault
### Cloud-Native Digital Certificate Management System

Certificate Vault is a modern, stateless web application designed to securely upload, organize, search, view, and manage digital certificates (PDFs and Images). Built with a local-first repository model, its storage layer is fully decoupled, facilitating a seamless transition to AWS (Amazon S3 and Amazon DynamoDB) later without touching controllers.

---

## Features
- **Modern UI/UX**: Premium dashboard interface with dark-slate gradients, glassmorphism, responsive panels, and smooth CSS micro-animations.
- **Client-Side Single-Page Router**: Fluid switching between Login, Register, Dashboard, Upload form, Table lists, Profile Settings, and Modals without page reloads.
- **Secure Authentication**: JWT-based session management, password hashing via `bcrypt`, and protected REST API endpoints.
- **Drag & Drop Certificate Upload**: Multer-backed local uploads with file size (max 5MB) and type validation (PDF, PNG, JPG, JPEG, GIF) with client previews.
- **Metadata Management**: Searchable, filterable (by category), and sortable tables with page navigation controls.
- **Abstracted Data Layer**: Clean stateless storage interface (`backend/utils/storage.js`) syncing to JSON files to simulate future AWS DynamoDB database operations.

---

## Folder Structure
```
certificate-vault/
├── backend/
│   ├── package.json               # Backend dependencies & run scripts
│   ├── server.js                  # Main Express server configuration & error handler
│   ├── .env                       # Environment configuration (Port, JWT Secret)
│   ├── routes/
│   │   ├── authRoutes.js          # Authentication routing endpoints
│   │   └── certificateRoutes.js   # Certificate CRUD routing endpoints
│   ├── controllers/
│   │   ├── authController.js      # Register, login, profile controller handlers
│   │   └── certificateController.js # Certificate CRUD controller actions
│   ├── middleware/
│   │   ├── authMiddleware.js      # JWT Token validation middleware
│   │   └── uploadMiddleware.js    # Multer validator/uploader configuration
│   ├── utils/
│   │   └── storage.js             # Storage abstraction interface (Future DynamoDB swap)
│   └── uploads/                   # Temporary directory for local certificate files
├── frontend/
│   └── index.html                 # Single-file HTML interface utilizing Tailwind CDN
└── README.md                      # Documentation
```

---

## API Documentation

### Authentication APIs

#### `POST /api/auth/register`
Creates a new user account.
- **Body**: `{ "name": "John", "email": "john@example.com", "password": "pass", "confirmPassword": "pass" }`
- **Response (Success)**: Status `210` or `201` with token and user details.

#### `POST /api/auth/login`
Authenticates a user and returns a session token.
- **Body**: `{ "email": "john@example.com", "password": "pass" }`
- **Response (Success)**: Status `200` with JWT token.

#### `GET /api/auth/profile`
Retrieves currently authenticated user info (requires header `Authorization: Bearer <JWT>`).
- **Response (Success)**: Status `200` with user metadata.

#### `PUT /api/auth/profile`
Updates current user name, email, or changes password (requires header `Authorization: Bearer <JWT>`).

---

### Certificate APIs (All Protected with JWT)

#### `POST /api/certificates`
Uploads file & registers certificate.
- **Content-Type**: `multipart/form-data`
- **Form Fields**: `file` (PDF/Image), `name`, `organization`, `category`, `issueDate`, `expiryDate` (optional), `description` (optional).
- **Response (Success)**: Status `210` or `201` with metadata.

#### `GET /api/certificates`
Lists user certificates.
- **Query Params**: `page`, `limit`, `search`, `category`, `sortBy`, `sortOrder`.
- **Response (Success)**: Status `200` with array of items, pagination properties, and stats (total size, category count).

#### `GET /api/certificates/:id`
Retrieves single certificate details.

#### `PUT /api/certificates/:id`
Updates certificate metadata.

#### `DELETE /api/certificates/:id`
Deletes certificate record and local storage file.

---

## How to Run

### 1. Start Backend Server
Navigate to the backend directory, install packages, and start the node process:
```bash
cd backend
npm install
npm start
```
By default, the server will launch and listen on port `5000` (`http://localhost:5000`).

### 2. Launch Frontend
Since the frontend is a standalone single HTML file, you can run it directly:
- Open `frontend/index.html` in any web browser.
- Double-click the file or serve it using a lightweight local web server (e.g. `npx serve frontend` or VS Code Live Server).

---

## Future AWS Migration Plan

### Step 1: File Storage (S3 Migration)
In `backend/middleware/uploadMiddleware.js`, swap local disk storage with `multer-s3` linked to an Amazon S3 Bucket:
```javascript
const { S3Client } = require('@aws-sdk/client-s3');
const multerS3 = require('multer-s3');

const s3 = new S3Client({ region: 'us-east-1' });

const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: 'my-certificate-vault-bucket',
    key: (req, file, cb) => {
      cb(null, `certificates/${Date.now()}-${file.originalname}`);
    }
  })
});
```

### Step 2: Metadata Database (DynamoDB Migration)
In `backend/utils/storage.js`, replace the JSON filesystem operations with AWS SDK client calls to DynamoDB tables (e.g. `UsersTable` and `CertificatesTable`).
- Swapping the methods (`saveCertificate`, `getCertificatesByUserId`, `deleteCertificate`) here automatically changes the database engine without modifying controller routes or business logic in `certificateController.js`.
