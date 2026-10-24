module.exports = {
  preset: 'jest-expo',
  resolver: 'react-native-worklets/jest/resolver',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // Exercise real icons through their CommonJS build in Jest's native resolver.
  moduleNameMapper: {
    '^lucide-react-native$':
      '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
  },
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
  watchman: false,
};
