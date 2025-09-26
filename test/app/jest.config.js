module.exports = {
  rootDir: '../../',
  setupFiles: ['<rootDir>/.jest/setEnvVars.js'],
  setupFilesAfterEnv: ['<rootDir>/test/app/jest.setup.ts'],
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/test/app/**/*.test.{ts,tsx}'],
  moduleNameMapper: {
    '^@app/(.*)$': '<rootDir>/src/app/src/$1',
    '^@promptfoo/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  transform: {
    '^.+\\.m?[tj]sx?$': ['@swc/jest', {
      jsc: {
        transform: {
          react: {
            runtime: 'automatic',
          },
        },
        target: 'es2020',
      },
    }],
  },
  globals: {
    'import.meta': {
      env: {
        VITE_PUBLIC_PROMPTFOO_REMOTE_API_BASE_URL: '',
        VITE_PROMPTFOO_BUILD_STANDALONE_SERVER: 'false',
      },
    },
  },
  modulePathIgnorePatterns: ['<rootDir>/dist', '<rootDir>/examples', '<rootDir>/node_modules'],
  collectCoverageFrom: [
    'src/app/src/**/*.{ts,tsx}',
    '!src/app/src/**/*.d.ts',
    '!src/app/src/**/index.ts',
    '!src/app/src/main.tsx',
  ],
};