/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/test/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
  // Coverage is enforced on the pure domain modules (brief §11).
  collectCoverageFrom: [
    'src/domain/**/*.ts',
    'src/parse/**/*.ts',
    'src/sms/**/*.ts',
    '!src/sms/native.ts',
    '!**/*.d.ts',
    '!**/index.ts',
  ],
  coverageThreshold: {
    global: { statements: 90, branches: 80, functions: 90, lines: 90 },
  },
};
