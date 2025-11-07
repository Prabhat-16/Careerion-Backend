// Backend AI Chat Tests
const request = require('supertest');
const mongoose = require('mongoose');

describe('AI Chat API Tests', () => {
    let userToken;
    let userId;

    beforeAll(async () => {
        // Create test user
        const response = await request(app)
            .post('/api/auth/signup')
            .send({
                name: 'Chat Test User',
                email: 'chattest@example.com',
                password: 'password123'
            });
        userToken = response.body.token;
        userId = response.body.user._id;
    });

    describe('POST /api/chat', () => {
        test('should respond to career-related query', async () => {
            const response = await request(app)
                .post('/api/chat')
                .send({
                    message: 'What career path should I choose?',
                    history: []
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('response');
            expect(response.body).toHaveProperty('modelUsed');
            expect(typeof response.body.response).toBe('string');
            expect(response.body.response.length).toBeGreaterThan(0);
        });

        test('should reject non-career-related query', async () => {
            const response = await request(app)
                .post('/api/chat')
                .send({
                    message: 'What is the weather today?',
                    history: []
                });

            expect(response.status).toBe(200);
            expect(response.body.response).toContain('career');
        });

        test('should handle conversation history', async () => {
            const response = await request(app)
                .post('/api/chat')
                .send({
                    message: 'Tell me more about that',
                    history: [
                        { sender: 'user', text: 'What skills do I need for software engineering?' },
                        { sender: 'ai', text: 'You need programming skills, problem-solving...' }
                    ]
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('response');
        });

        test('should handle empty message', async () => {
            const response = await request(app)
                .post('/api/chat')
                .send({
                    message: '',
                    history: []
                });

            expect(response.status).toBeOneOf([400, 200]);
        });

        test('should handle system prompt', async () => {
            const response = await request(app)
                .post('/api/chat')
                .send({
                    message: 'Give me career advice',
                    history: [],
                    systemPrompt: 'Focus on technology careers'
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('response');
        });

        test('should handle JSON expectation', async () => {
            const response = await request(app)
                .post('/api/chat')
                .send({
                    message: 'List 3 career options',
                    history: [],
                    expectJson: true
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('response');
        });

        test('should fail without GEMINI_API_KEY', async () => {
            // This test assumes GEMINI_API_KEY is not set
            const originalKey = process.env.GEMINI_API_KEY;
            delete process.env.GEMINI_API_KEY;

            const response = await request(app)
                .post('/api/chat')
                .send({
                    message: 'Test message',
                    history: []
                });

            expect(response.status).toBe(500);
            expect(response.body.error).toContain('GEMINI_API_KEY');

            process.env.GEMINI_API_KEY = originalKey;
        });
    });

    describe('POST /api/career-recommendations', () => {
        beforeEach(async () => {
            // Update user profile
            await request(app)
                .post('/api/user/profile')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    educationLevel: "Bachelor's Degree",
                    fieldOfStudy: 'Computer Science',
                    currentStatus: 'Student',
                    skills: ['JavaScript', 'Python', 'React'],
                    interests: ['Web Development', 'AI'],
                    careerGoals: 'Become a full-stack developer'
                });
        });

        test('should provide personalized career recommendations', async () => {
            const response = await request(app)
                .post('/api/career-recommendations')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    query: 'What career path should I pursue?',
                    category: 'general'
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('response');
            expect(response.body.response.length).toBeGreaterThan(500); // Comprehensive response
            expect(response.body).toHaveProperty('userProfile');
        });

        test('should fail without authentication', async () => {
            const response = await request(app)
                .post('/api/career-recommendations')
                .send({
                    query: 'Career advice please',
                    category: 'general'
                });

            expect(response.status).toBe(401);
        });

        test('should fail without query', async () => {
            const response = await request(app)
                .post('/api/career-recommendations')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    category: 'general'
                });

            expect(response.status).toBe(400);
        });

        test('should handle different categories', async () => {
            const categories = ['skills', 'transition', 'interview', 'salary'];
            
            for (const category of categories) {
                const response = await request(app)
                    .post('/api/career-recommendations')
                    .set('Authorization', `Bearer ${userToken}`)
                    .send({
                        query: 'Give me advice',
                        category: category
                    });

                expect(response.status).toBe(200);
                expect(response.body).toHaveProperty('category', category);
            }
        });
    });

    describe('Career Detection Logic', () => {
        const careerQueries = [
            'What career should I choose?',
            'How do I become a software engineer?',
            'What skills do I need for data science?',
            'Help me with my resume',
            'Interview tips for tech jobs',
            'Salary negotiation advice',
            'Career transition guidance',
            'Professional development tips'
        ];

        const nonCareerQueries = [
            'What is the weather?',
            'Tell me a joke',
            'What is 2+2?',
            'Who won the game yesterday?',
            'Recipe for pasta'
        ];

        test('should accept career-related queries', async () => {
            for (const query of careerQueries) {
                const response = await request(app)
                    .post('/api/chat')
                    .send({
                        message: query,
                        history: []
                    });

                expect(response.status).toBe(200);
                expect(response.body.response).not.toContain('I\'m here to help you with career guidance');
            }
        });

        test('should redirect non-career queries', async () => {
            for (const query of nonCareerQueries) {
                const response = await request(app)
                    .post('/api/chat')
                    .send({
                        message: query,
                        history: []
                    });

                expect(response.status).toBe(200);
                expect(response.body.response).toContain('career');
            }
        });
    });
});
