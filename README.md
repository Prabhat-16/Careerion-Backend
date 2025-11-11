# Careerion Backend API 🚀

Node.js + Express backend API server for the Careerion platform.

## 📋 Overview

The backend provides RESTful API endpoints for:
- User authentication (JWT + Google OAuth)
- AI-powered career guidance (Google Gemini)
- User profile management
- Job listings and applications
- Admin operations
- Analytics and reporting

## 🛠 Tech Stack

- **Runtime:** Node.js 20.x
- **Framework:** Express.js 4.21
- **Database:** MongoDB 7.0 with Mongoose 8.8
- **Authentication:** JWT + Google OAuth 2.0
- **AI:** Google Gemini AI (gemini-2.0-flash)
- **Testing:** Jest + Supertest
- **Validation:** Express Validator
- **Security:** Helmet, CORS, bcrypt

## 📁 Project Structure

```
Backend/
├── models/              # MongoDB models
│   ├── User.js         # User model
│   ├── Job.js          # Job model
│   ├── Application.js  # Application model
│   └── ChatHistory.js  # Chat history model
├── routes/             # API routes
│   ├── auth.js         # Authentication routes
│   ├── chat.js         # Chat routes
│   ├── admin.js        # Admin routes
│   └── jobs.js         # Job routes
├── middleware/         # Express middleware
│   ├── auth.js         # JWT verification
│   └── admin.js        # Admin authorization
├── tests/              # Test files
│   ├── auth.test.js    # Auth tests
│   ├── chat.test.js    # Chat tests
│   └── admin.test.js   # Admin tests
├── server.js           # Main server file
├── Dockerfile          # Docker configuration
└── package.json        # Dependencies
```

## 🚀 Getting Started

### Prerequisites
- Node.js 20.x or higher
- MongoDB 7.0 or higher
- npm or yarn

### Installation

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   ```

3. **Edit .env file**
   ```env
   MONGO_URI=mongodb://localhost:27017/careerion
   PORT=5001
   JWT_SECRET=your-super-secret-jwt-key-min-32-chars
   GEMINI_API_KEY=your-gemini-api-key
   GEMINI_MODEL=gemini-2.0-flash
   GOOGLE_CLIENT_ID=your-google-oauth-client-id
   ```

4. **Start MongoDB**
   ```bash
   # Using Docker
   docker run -d -p 27017:27017 --name mongodb mongo:7.0
   
   # Or start local MongoDB service
   mongod
   ```

5. **Start the server**
   ```bash
   # Development mode (with auto-reload)
   npm run dev
   
   # Production mode
   npm start
   ```

Server will run on http://localhost:5001

## 📚 API Endpoints

### Authentication

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword"
}

Response: 201 Created
{
  "token": "jwt-token",
  "user": {
    "_id": "user-id",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securepassword"
}

Response: 200 OK
{
  "token": "jwt-token",
  "user": { ... }
}
```

#### Google OAuth
```http
POST /api/auth/google
Content-Type: application/json

{
  "credential": "google-oauth-token"
}

Response: 200 OK
{
  "token": "jwt-token",
  "user": { ... }
}
```

### Career Chat

#### Send Message
```http
POST /api/chat
Authorization: Bearer <token>
Content-Type: application/json

{
  "message": "What career should I pursue?",
  "category": "general"
}

Response: 200 OK
{
  "response": "AI-generated career guidance...",
  "modelUsed": "gemini-2.0-flash"
}
```

#### Enhanced Guidance
```http
POST /api/chat/enhanced
Authorization: Bearer <token>
Content-Type: application/json

{
  "message": "I need career advice",
  "category": "skills",
  "userProfile": {
    "skills": ["JavaScript", "React"],
    "experience": "2 years"
  }
}

Response: 200 OK
{
  "response": "Personalized career guidance...",
  "category": "skills",
  "recommendations": [...]
}
```

### Admin

#### Get All Users
```http
GET /api/admin/users
Authorization: Bearer <admin-token>

Response: 200 OK
{
  "users": [...]
}
```

#### Get Analytics
```http
GET /api/admin/analytics
Authorization: Bearer <admin-token>

Response: 200 OK
{
  "totalUsers": 1000,
  "activeUsers": 750,
  "totalJobs": 500,
  "totalApplications": 2000
}
```

### Jobs

#### Get All Jobs
```http
GET /api/jobs

Response: 200 OK
{
  "jobs": [...]
}
```

#### Create Job (Admin)
```http
POST /api/admin/jobs
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "title": "Software Engineer",
  "company": "Tech Corp",
  "description": "...",
  "requirements": ["JavaScript", "React"],
  "salary": "$80,000 - $120,000"
}

Response: 201 Created
{
  "job": { ... }
}
```

## 🧪 Testing

### Run Tests
```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- auth.test.js

# Run tests in watch mode
npm test -- --watch
```

### Test Structure
```javascript
// Example test
describe('Auth API', () => {
  test('should register a new user', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      });
    
    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('token');
  });
});
```

## 🔐 Security

### Authentication
- JWT tokens with 24-hour expiration
- Password hashing with bcrypt (10 rounds)
- Google OAuth 2.0 integration

### Middleware
- CORS protection
- Helmet for security headers
- Rate limiting (100 requests per 15 minutes)
- Input validation and sanitization

### Best Practices
- Environment variables for secrets
- No sensitive data in logs
- Secure MongoDB connection
- HTTPS in production

## 🐳 Docker

### Build Image
```bash
docker build -t careerion-backend .
```

### Run Container
```bash
docker run -d \
  -p 5001:5001 \
  -e MONGO_URI=mongodb://host.docker.internal:27017/careerion \
  -e JWT_SECRET=your-secret \
  -e GEMINI_API_KEY=your-key \
  --name careerion-backend \
  careerion-backend
```

### Docker Compose
```bash
docker-compose up -d backend
```

## 📊 Database Models

### User Model
```javascript
{
  name: String,
  email: String (unique),
  password: String (hashed),
  googleId: String,
  role: String (user/admin),
  profile: {
    skills: [String],
    experience: String,
    education: String
  },
  createdAt: Date,
  updatedAt: Date
}
```

### Job Model
```javascript
{
  title: String,
  company: String,
  description: String,
  requirements: [String],
  salary: String,
  location: String,
  type: String (full-time/part-time/contract),
  postedBy: ObjectId (User),
  createdAt: Date,
  updatedAt: Date
}
```

### Application Model
```javascript
{
  job: ObjectId (Job),
  user: ObjectId (User),
  status: String (pending/accepted/rejected),
  resume: String,
  coverLetter: String,
  appliedAt: Date
}
```

## 🔧 Configuration

### Environment Variables
```env
# Server
NODE_ENV=development|production
PORT=5001

# Database
MONGO_URI=mongodb://localhost:27017/careerion

# Authentication
JWT_SECRET=your-super-secret-jwt-key-min-32-chars

# Google Gemini AI
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.0-flash

# Google OAuth
GOOGLE_CLIENT_ID=your-google-oauth-client-id

# Optional
RATE_LIMIT_WINDOW=15 # minutes
RATE_LIMIT_MAX=100 # requests
```

## 📈 Performance

- Response time: < 200ms average
- Database queries optimized with indexes
- Connection pooling for MongoDB
- Caching ready (Redis integration available)

## 🐛 Debugging

### Enable Debug Logs
```bash
DEBUG=* npm start
```

### Check Health
```bash
curl http://localhost:5001/api/health
```

### MongoDB Connection
```bash
# Test connection
mongosh mongodb://localhost:27017/careerion
```

## 🚀 Deployment

### Production Checklist
- [ ] Set NODE_ENV=production
- [ ] Use strong JWT_SECRET
- [ ] Configure MongoDB with authentication
- [ ] Enable HTTPS
- [ ] Set up monitoring
- [ ] Configure backups
- [ ] Set up logging

### PM2 (Process Manager)
```bash
# Install PM2
npm install -g pm2

# Start server
pm2 start server.js --name careerion-backend

# Monitor
pm2 monit

# Logs
pm2 logs careerion-backend
```

## 📝 Scripts

```json
{
  "start": "node server.js",
  "dev": "nodemon server.js",
  "test": "jest",
  "test:watch": "jest --watch",
  "test:coverage": "jest --coverage"
}
```

## 🤝 Contributing

1. Follow the existing code style
2. Write tests for new features
3. Update API documentation
4. Keep commits atomic

## 📞 Support

For backend-specific issues:
- Check logs: `docker-compose logs backend`
- Test endpoints: Use Postman or curl
- Database issues: Check MongoDB connection

---

**Backend Version:** 1.0.0
**Last Updated:** November 11, 2025
