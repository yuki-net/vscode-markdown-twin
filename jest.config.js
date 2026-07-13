/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/test/**/*.test.ts'],
  moduleNameMapper: {
    // VSCode APIはNode環境ではインポートできないため、モックします
    '^vscode$': '<rootDir>/src/test/support/mocks/vscode.ts'
  }
};
