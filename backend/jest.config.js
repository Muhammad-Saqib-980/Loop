module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setupEnv.ts'],
  testMatch: ['**/test/**/*.test.ts'],
};
