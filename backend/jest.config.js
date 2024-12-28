module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Test files pattern
  testMatch: ['**/tests/**/*.test.js'],

  // Test timeout (30 seconds for API calls)
  testTimeout: 30000,

  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'clover'],
  collectCoverageFrom: [
    'app/**/*.js',
    '!app/config/**',
    '!app/models/index.js'
  ],

  // Setup files
  setupFilesAfterEnv: ['./tests/setup.js'],

  // Global variables
  globals: {
    // Add any global variables needed for tests
  },

  // Module name mapper for handling non-JS imports
  moduleNameMapper: {
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      '<rootDir>/tests/__mocks__/fileMock.js',
    '\\.(css|less|scss|sass)$': '<rootDir>/tests/__mocks__/styleMock.js'
  },

  // Test environment variables
  testEnvironmentVariables: {
    NODE_ENV: 'test'
  }
};
