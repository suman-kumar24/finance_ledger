/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/test/setup.ts', '<rootDir>/test/setup-ui.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@shopify/flash-list|@noble/.*|drizzle-orm))',
  ],
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
