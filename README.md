# Careerion Backend Server

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Create Environment File
Create a `.env` file in the backend folder with the following variables:

```env
# MongoDB Connection String
MONGO_URI=mongodb://localhost:27017/careerion

# Google Gemini AI API Key
GEMINI_API_KEY=your_gemini_api_key_here

# JWT Secret for User Authentication
JWT_SECRET=your_super_secret_jwt_key_here

# Server Port
PORT=5001
```

### 3. Install MongoDB
Make sure MongoDB is running on your system. You can:
- Install MongoDB locally: https://docs.mongodb.com/manual/installation/
- Use MongoDB Atlas (cloud): https://www.mongodb.com/atlas
- Use Docker: `docker run -d -p 27017:27017 --name mongodb mongo:latest`

### 4. Get Google Gemini API Key
1. Go to https://makersuite.google.com/app/apikey
2. Create a new API key
3. Add it to your `.env` file

### 5. Start the Server
```bash
# Development mode (with auto-restart)
npm run dev

# Production mode
npm start
```

The server will start on http://localhost:5001

## Available Endpoints

### User Authentication
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/google` - Google login using access_token (Option B)

### Admin Panel
- `GET /api/admin/stats` - Dashboard statistics
- `GET /api/admin/users` - List all users
- `GET /api/admin/jobs` - List all jobs
- `GET /api/admin/companies` - List all companies
- `GET /api/admin/applications` - List all applications

### AI Chat
- `POST /api/chat` - AI conversation endpoint

## Sample Data
The server automatically creates sample data on first run:
- 3 sample users
- 3 sample companies
- 3 sample jobs

## User Registration Flow

### 1. Frontend Signup Form
The frontend has a beautiful signup form with:
- Name field
- Email field  
- Password field
- Submit button

### 2. Backend Processing
When a user submits the signup form:
1. **Validation**: Checks if all fields are filled and password is at least 6 characters
2. **Duplicate Check**: Ensures email isn't already registered
3. **Password Hashing**: Securely hashes the password using bcrypt
4. **User Creation**: Saves the new user to MongoDB
5. **JWT Token**: Generates a secure authentication token
6. **Response**: Returns user data and token

### 3. Security Features
- **Password Hashing**: Passwords are never stored in plain text
- **JWT Tokens**: Secure authentication tokens for logged-in users
- **Input Validation**: Prevents invalid data from being saved
- **Duplicate Prevention**: Prevents multiple accounts with same email

## Google OAuth (Option B: access_token)

This backend supports Google login using an access_token received from the frontend via `@react-oauth/google` (`useGoogleLogin`).

- Endpoint: `POST /api/auth/google`
- Request body:
  ```json
  { "token": "<google_access_token>" }
  ```
- Behavior:
  - Calls Google's UserInfo endpoint: `https://www.googleapis.com/oauth2/v3/userinfo` with `Authorization: Bearer <token>`
  - Creates a user if one does not exist (generates a random hashed password to satisfy schema)
  - Returns JWT and user info

- Example response:
  ```json
  {
    "message": "Google login successful",
    "user": {
      "_id": "...",
      "name": "Your Name",
      "email": "you@example.com",
      "createdAt": "...",
      "avatar": "https://..."
    },
    "token": "<jwt>"
  }
  ```

- Requirements:
  - Node.js v18+ (for global `fetch`). If using older Node, install `node-fetch` and import it.
  - Frontend must pass `access_token` (not ID token). If using `<GoogleLogin />` instead, switch backend to verify ID tokens.

## Testing the Signup

### Using Postman or similar tool:
```http
POST http://localhost:5001/api/auth/signup
Content-Type: application/json

{
    "name": "Test User",
    "email": "test@example.com",
    "password": "password123"
}
```

### Expected Response:
```json
{
    "message": "User created successfully",
    "user": {
        "_id": "user_id_here",
        "name": "Test User",
        "email": "test@example.com",
        "createdAt": "2025-01-16T..."
    },
    "token": "jwt_token_here"
}
```

## Troubleshooting

### Connection Issues
1. Make sure MongoDB is running
2. Check your MONGO_URI in .env file
3. Verify the port isn't blocked by firewall

### API Key Issues
1. Ensure GEMINI_API_KEY is set in .env
2. Check if the API key is valid
3. Verify you have access to Google Gemini API

### Authentication Issues
1. Ensure JWT_SECRET is set in .env
2. Check if bcryptjs and jsonwebtoken are installed
3. Verify the signup endpoint is accessible
4. For Google login, ensure Node v18+ (or add `node-fetch`) and that the frontend sends `access_token` to `/api/auth/google`.
