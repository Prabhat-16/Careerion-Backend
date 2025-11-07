// Backend Admin API Tests
const request = require('supertest');
const mongoose = require('mongoose');

describe('Admin API Tests', () => {
    let adminToken;
    let superAdminToken;
    let userToken;
    let testUserId;

    beforeAll(async () => {
        // Create test users with different roles
        const superAdminRes = await request(app)
            .post('/api/auth/signup')
            .send({
                name: 'Super Admin',
                email: 'superadmin@test.com',
                password: 'password123'
            });
        
        // Manually set role to superadmin
        const User = mongoose.model('User');
        await User.findByIdAndUpdate(superAdminRes.body.user._id, { role: 'superadmin' });
        
        // Login to get token with updated role
        const superAdminLogin = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'superadmin@test.com',
                password: 'password123'
            });
        superAdminToken = superAdminLogin.body.token;

        // Create admin user
        const adminRes = await request(app)
            .post('/api/auth/signup')
            .send({
                name: 'Admin User',
                email: 'admin@test.com',
                password: 'password123'
            });
        await User.findByIdAndUpdate(adminRes.body.user._id, { role: 'admin' });
        
        const adminLogin = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'admin@test.com',
                password: 'password123'
            });
        adminToken = adminLogin.body.token;

        // Create regular user
        const userRes = await request(app)
            .post('/api/auth/signup')
            .send({
                name: 'Regular User',
                email: 'user@test.com',
                password: 'password123'
            });
        userToken = userRes.body.token;
        testUserId = userRes.body.user._id;
    });

    describe('GET /api/admin/stats', () => {
        test('should return stats for admin', async () => {
            const response = await request(app)
                .get('/api/admin/stats')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('totalUsers');
            expect(response.body).toHaveProperty('totalJobs');
            expect(response.body).toHaveProperty('totalCompanies');
            expect(response.body).toHaveProperty('totalApplications');
        });

        test('should fail for regular user', async () => {
            const response = await request(app)
                .get('/api/admin/stats')
                .set('Authorization', `Bearer ${userToken}`);

            expect(response.status).toBe(403);
        });

        test('should fail without token', async () => {
            const response = await request(app)
                .get('/api/admin/stats');

            expect(response.status).toBe(401);
        });
    });

    describe('GET /api/admin/users', () => {
        test('should return list of users for admin', async () => {
            const response = await request(app)
                .get('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('users');
            expect(Array.isArray(response.body.users)).toBe(true);
        });

        test('should support pagination', async () => {
            const response = await request(app)
                .get('/api/admin/users?page=1&limit=10')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('pagination');
            expect(response.body.pagination).toHaveProperty('page', 1);
            expect(response.body.pagination).toHaveProperty('limit', 10);
        });

        test('should support search', async () => {
            const response = await request(app)
                .get('/api/admin/users?search=Regular')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.users.length).toBeGreaterThan(0);
        });

        test('should support role filter', async () => {
            const response = await request(app)
                .get('/api/admin/users?role=admin')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.users.every(u => u.role === 'admin')).toBe(true);
        });
    });

    describe('POST /api/admin/users', () => {
        test('should create new user as admin', async () => {
            const response = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'New User',
                    email: 'newuser@test.com',
                    password: 'password123',
                    role: 'user'
                });

            expect(response.status).toBe(201);
            expect(response.body.user).toHaveProperty('email', 'newuser@test.com');
        });

        test('should fail to create admin user as regular admin', async () => {
            const response = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'New Admin',
                    email: 'newadmin@test.com',
                    password: 'password123',
                    role: 'admin'
                });

            expect(response.status).toBe(403);
        });

        test('should create admin user as superadmin', async () => {
            const response = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${superAdminToken}`)
                .send({
                    name: 'New Admin',
                    email: 'newadmin2@test.com',
                    password: 'password123',
                    role: 'admin'
                });

            expect(response.status).toBe(201);
            expect(response.body.user).toHaveProperty('role', 'admin');
        });

        test('should fail with duplicate email', async () => {
            const response = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'Duplicate',
                    email: 'user@test.com',
                    password: 'password123'
                });

            expect(response.status).toBe(400);
        });
    });

    describe('PUT /api/admin/users/:id', () => {
        test('should update user as admin', async () => {
            const response = await request(app)
                .put(`/api/admin/users/${testUserId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'Updated Name'
                });

            expect(response.status).toBe(200);
            expect(response.body.user).toHaveProperty('name', 'Updated Name');
        });

        test('should update user status', async () => {
            const response = await request(app)
                .put(`/api/admin/users/${testUserId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    isActive: false
                });

            expect(response.status).toBe(200);
            expect(response.body.user).toHaveProperty('isActive', false);
        });

        test('should fail to update non-existent user', async () => {
            const fakeId = new mongoose.Types.ObjectId();
            const response = await request(app)
                .put(`/api/admin/users/${fakeId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'Test'
                });

            expect(response.status).toBe(404);
        });
    });

    describe('DELETE /api/admin/users/:id', () => {
        test('should delete user as admin', async () => {
            // Create user to delete
            const createRes = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'To Delete',
                    email: 'delete@test.com',
                    password: 'password123'
                });

            const response = await request(app)
                .delete(`/api/admin/users/${createRes.body.user._id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
        });

        test('should fail to delete self', async () => {
            const User = mongoose.model('User');
            const admin = await User.findOne({ email: 'admin@test.com' });

            const response = await request(app)
                .delete(`/api/admin/users/${admin._id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(400);
        });
    });

    describe('Jobs Management', () => {
        let jobId;

        test('POST /api/admin/jobs - should create job', async () => {
            const response = await request(app)
                .post('/api/admin/jobs')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    title: 'Software Engineer',
                    company: 'Tech Corp',
                    location: 'San Francisco, CA',
                    status: 'active'
                });

            expect(response.status).toBe(201);
            expect(response.body.job).toHaveProperty('title', 'Software Engineer');
            jobId = response.body.job._id;
        });

        test('GET /api/admin/jobs - should list jobs', async () => {
            const response = await request(app)
                .get('/api/admin/jobs')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });

        test('PUT /api/admin/jobs/:id - should update job', async () => {
            const response = await request(app)
                .put(`/api/admin/jobs/${jobId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    status: 'closed'
                });

            expect(response.status).toBe(200);
            expect(response.body.job).toHaveProperty('status', 'closed');
        });

        test('DELETE /api/admin/jobs/:id - should delete job', async () => {
            const response = await request(app)
                .delete(`/api/admin/jobs/${jobId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
        });
    });

    describe('Companies Management', () => {
        let companyId;

        test('POST /api/admin/companies - should create company', async () => {
            const response = await request(app)
                .post('/api/admin/companies')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'Test Company',
                    industry: 'Technology',
                    size: 'medium',
                    status: 'active'
                });

            expect(response.status).toBe(201);
            expect(response.body.company).toHaveProperty('name', 'Test Company');
            companyId = response.body.company._id;
        });

        test('GET /api/admin/companies - should list companies', async () => {
            const response = await request(app)
                .get('/api/admin/companies')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });

        test('PUT /api/admin/companies/:id - should update company', async () => {
            const response = await request(app)
                .put(`/api/admin/companies/${companyId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    size: 'large'
                });

            expect(response.status).toBe(200);
            expect(response.body.company).toHaveProperty('size', 'large');
        });

        test('DELETE /api/admin/companies/:id - should delete company', async () => {
            const response = await request(app)
                .delete(`/api/admin/companies/${companyId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
        });
    });
});
