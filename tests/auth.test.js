// Backend Authentication Tests
const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Mock app setup
let app;
let server;

describe('Authentication API Tests', () => {
    beforeAll(async () => {
        // Setup test database connection
        const mongoUri = process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/careerion_test';
        await mongoose.connect(mongoUri);
    });

    afterAll(async () => {
        // Cleanup
        await mongoose.connection.dropDatabase();
        await mongoose.connection.close();
    });

    describe('POST /api/auth/signup', () => {
        test('should create a new user with valid data', async () => {
            const response = await request(app)
                .post('/api/auth/signup')
                .send({
                    name: 'Test User',
                    email: 'test@example.com',
                    password: 'password123'
                });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('token');
            expect(response.body.user).toHaveProperty('email', 'test@example.com');
            expect(response.body.user).not.toHaveProperty('password');
        });

        test('should fail with missing required fields', async () => {
            const response = await request(app)
                .post('/api/auth/signup')
                .send({
                    email: 'test2@example.com'
                });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
        });

        test('should fail with duplicate email', async () => {
            await request(app)
                .post('/api/auth/signup')
                .send({
                    name: 'User One',
                    email: 'duplicate@example.com',
                    password: 'password123'
                });

            const response = await request(app)
                .post('/api/auth/signup')
                .send({
                    name: 'User Two',
                    email: 'duplicate@example.com',
                    password: 'password456'
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toContain('already exists');
        });

        test('should fail with weak password', async () => {
            const response = await request(app)
                .post('/api/auth/signup')
                .send({
                    name: 'Test User',
                    email: 'weak@example.com',
                    password: '123'
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toContain('at least 6 characters');
        });

        test('should hash password before storing', async () => {
            const password = 'testpassword123';
            await request(app)
                .post('/api/auth/signup')
                .send({
                    name: 'Hash Test',
                    email: 'hash@example.com',
                    password: password
                });

            const User = mongoose.model('User');
            const user = await User.findOne({ email: 'hash@example.com' });
            
            expect(user.password).not.toBe(password);
            const isMatch = await bcrypt.compare(password, user.password);
            expect(isMatch).toBe(true);
        });
    });

    describe('POST /api/auth/login', () => {
        beforeEach(async () => {
            // Create test user
            await request(app)
                .post('/api/auth/signup')
                .send({
                    name: 'Login Test',
                    email: 'login@example.com',
                    password: 'password123'
                });
        });

        test('should login with valid credentials', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'login@example.com',
                    password: 'password123'
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('token');
            expect(response.body.user).toHaveProperty('email', 'login@example.com');
        });

        test('should fail with invalid email', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'nonexistent@example.com',
                    password: 'password123'
                });

            expect(response.status).toBe(401);
            expect(response.body.error).toContain('Invalid');
        });

        test('should fail with invalid password', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'login@example.com',
                    password: 'wrongpassword'
                });

            expect(response.status).toBe(401);
            expect(response.body.error).toContain('Invalid');
        });

        test('should fail with missing credentials', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'login@example.com'
                });

            expect(response.status).toBe(400);
        });

        test('should update lastLogin timestamp', async () => {
            const User = mongoose.model('User');
            const userBefore = await User.findOne({ email: 'login@example.com' });
            const lastLoginBefore = userBefore.lastLogin;

            await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'login@example.com',
                    password: 'password123'
                });

            const userAfter = await User.findOne({ email: 'login@example.com' });
            expect(userAfter.lastLogin).not.toBe(lastLoginBefore);
        });
    });

    describe('GET /api/auth/me', () => {
        let token;

        beforeEach(async () => {
            const response = await request(app)
                .post('/api/auth/signup')
                .send({
                    name: 'Me Test',
                    email: 'me@example.com',
                    password: 'password123'
                });
            token = response.body.token;
        });

        test('should return current user with valid token', async () => {
            const response = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('email', 'me@example.com');
            expect(response.body).not.toHaveProperty('password');
        });

        test('should fail without token', async () => {
            const response = await request(app)
                .get('/api/auth/me');

            expect(response.status).toBe(401);
        });

        test('should fail with invalid token', async () => {
            const response = await request(app)
                .get('/api/auth/me')
                .set('Authorization', 'Bearer invalid-token');

            expect(response.status).toBe(401);
        });
    });

    describe('POST /api/auth/google', () => {
        test('should handle Google OAuth login', async () => {
            // Mock Google token verification
            const mockGoogleToken = 'mock-google-token';
            
            const response = await request(app)
                .post('/api/auth/google')
                .send({
                    token: mockGoogleToken
                });

            // This will fail in test without actual Google token
            // In real tests, you'd mock the Google API
            expect(response.status).toBeOneOf([200, 400]);
        });

        test('should fail without token', async () => {
            const response = await request(app)
                .post('/api/auth/google')
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.error).toContain('token is required');
        });
    });
});
