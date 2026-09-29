module.exports = {
  preset: 'jest-expo',
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/backend/', '<rootDir>/.claude/'],
  setupFiles: ['./jest.setup.js'],
};
