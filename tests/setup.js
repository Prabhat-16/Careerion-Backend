// Test Setup File for Backend
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

// Setup before all tests
beforeAll(async () => {
    // Create in-memory MongoDB instance
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    // Connect to the in-memory database
    await mongoose.connect(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    });
    
    console.log('Test database connected');
});

// Cleanup after each test
afterEach(async () => {
    // Clear all collections
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
});

// Cleanup after all tests
afterAll(async () => {
    // Disconnect from database
    await mongoose.disconnect();
    
    // Stop MongoDB instance
    if (mongoServer) {
        await mongoServer.stop();
    }
    
    console.log('Test database disconnected');
});

// Global test utilities
global.createTestUser = async (overrides = {}) => {
    const User = mongoose.model('User');
    const bcrypt = require('bcryptjs');
    
    const defaultUser = {
        name: 'Test User',
        email: `test${Date.now()}@example.com`,
        password: await bcrypt.hash('password123', 10),
        role: 'user',
        isActive: true,
        ...overrides
    };
    
    return await User.create(defaultUser);
};

global.generateToken = (userId, email, role = 'user') => {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
        { userId, email, role },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '7d' }
    );
};

// Suppress console logs during tests (optional)
if (process.env.SUPPRESS_LOGS === 'true') {
    global.console = {
        ...console,
        log: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    };
}
