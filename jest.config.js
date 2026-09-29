module.exports = {
  preset: 'react-native',
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/backend/', '<rootDir>/.claude/'],
  setupFiles: ['./jest.setup.js'],
};
