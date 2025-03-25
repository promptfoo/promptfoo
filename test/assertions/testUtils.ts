/**
 * Shared test utilities and mocks for assertion tests
 */

/**
 * Sets up common mocks needed for assertion tests
 */
export function setupCommonMocks(): void {
  jest.mock('../../src/redteam/remoteGeneration', () => ({
    shouldGenerateRemote: jest.fn().mockReturnValue(false),
  }));

  jest.mock('proxy-agent', () => ({
    ProxyAgent: jest.fn().mockImplementation(() => ({})),
  }));

  jest.mock('node:module', () => {
    const mockRequire: NodeJS.Require = {
      resolve: jest.fn() as unknown as NodeJS.RequireResolve,
    } as unknown as NodeJS.Require;
    return {
      createRequire: jest.fn().mockReturnValue(mockRequire),
    };
  });

  jest.mock('../../src/fetch', () => {
    const actual = jest.requireActual('../../src/fetch');
    return {
      ...actual,
      fetchWithRetries: jest.fn(actual.fetchWithRetries),
    };
  });

  jest.mock('glob', () => ({
    globSync: jest.fn(),
  }));

  jest.mock('fs', () => ({
    readFileSync: jest.fn(),
    promises: {
      readFile: jest.fn(),
    },
  }));

  jest.mock('../../src/esm');
  jest.mock('../../src/database', () => ({
    getDb: jest.fn(),
  }));

  jest.mock('path', () => ({
    ...jest.requireActual('path'),
    resolve: jest.fn(jest.requireActual('path').resolve),
    extname: jest.fn(jest.requireActual('path').extname),
  }));

  jest.mock('../../src/cliState', () => ({
    basePath: '/base/path',
  }));

  jest.mock('../../src/matchers', () => {
    const actual = jest.requireActual('../../src/matchers');
    return {
      ...actual,
      matchesContextRelevance: jest
        .fn()
        .mockResolvedValue({ pass: true, score: 1, reason: 'Mocked reason' }),
      matchesContextFaithfulness: jest
        .fn()
        .mockResolvedValue({ pass: true, score: 1, reason: 'Mocked reason' }),
    };
  });
}
