// Jest Configuration for Backend
module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Test match patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/__tests__/**/*.js'
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'server.js',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/coverage/**'
  ],

  // Coverage thresholds
  coverageThresholds: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // Coverage reporters
  coverageReporters: ['text', 'lcov', 'html'],

  // Test timeout
  testTimeout: 10000,

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/'
  ],

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,

  // Restore mocks between tests
  restoreMocks: true,

  // Reset mocks between tests
  resetMocks: true
};
