import { vi } from 'vitest';
import type { Mock } from 'vitest';

type MockModuleFactory = Extract<Parameters<typeof vi.mock>[1], (...args: never[]) => unknown>;

export const createProxyAgentFactory = (): MockModuleFactory => async (importOriginal) => {
  return {
    ...(await importOriginal()),

    ProxyAgent: vi.fn().mockImplementation(function () {
      return {};
    }),
  };
};

export const createFsModuleFactory =
  (fsMocks: Record<string, unknown>): MockModuleFactory =>
  async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
      ...actual,
      default: {
        ...actual,
        ...fsMocks,
      },
      ...fsMocks,
    };
  };

export const createWarningOrderedLoggerFactory = (): MockModuleFactory => () => ({
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
});

export const createDisabledCloudConfigFactory = (): MockModuleFactory => async (importOriginal) => {
  return {
    ...(await importOriginal()),

    CloudConfig: class {
      isEnabled() {
        return false;
      }
      getApiHost() {
        return 'https://api.promptfoo.app';
      }
    },
  };
};

export const createNodeHttpHandlerFactory = (): MockModuleFactory => () => ({
  __esModule: true,
  NodeHttpHandler: vi.fn().mockImplementation(function () {
    return {
      handle: vi.fn(),
    };
  }),
  default: vi.fn().mockImplementation(function () {
    return {
      handle: vi.fn(),
    };
  }),
});

export const createBedrockCacheFactory =
  (mockGet: Mock, mockSet: Mock, getMockIsCacheEnabled: () => Mock): MockModuleFactory =>
  async (importOriginal) => {
    return {
      ...(await importOriginal()),

      getCache: vi.fn().mockImplementation(function () {
        return {
          get: mockGet,
          set: mockSet,
        };
      }),

      isCacheEnabled: () => getMockIsCacheEnabled()(),
    };
  };

export const createEmptyGlobFactory = (): MockModuleFactory => async (importOriginal) => {
  return {
    ...(await importOriginal()),
    globSync: vi.fn().mockReturnValue([]),

    hasMagic: (path: string) => {
      // Match the real hasMagic behavior: only detect patterns in forward-slash paths
      // This mimics glob's actual behavior where backslash paths return false
      return /[*?[\]{}]/.test(path) && !path.includes('\\');
    },
  };
};

export const createFsPromiseOverlayFactory =
  (fsPromiseMocks: Record<string, unknown>): MockModuleFactory =>
  async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs/promises')>();
    return {
      ...actual,
      default: {
        ...actual,
        ...fsPromiseMocks,
      },
      ...fsPromiseMocks,
    };
  };

export const createExecFileFactory =
  (mockExecFile: Mock): MockModuleFactory =>
  async (importOriginal) => {
    const actual = await importOriginal<typeof import('child_process')>();
    return {
      ...actual,
      default: {
        ...actual,
        execFile: mockExecFile,
      },
      execFile: mockExecFile,
    };
  };

export const createRequestLoggerFactory = (): MockModuleFactory => () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  logRequestResponse: vi.fn(),
});

export const createLocalGenerationFactory = (): MockModuleFactory => async (importOriginal) => {
  return {
    ...(await importOriginal()),
    shouldGenerateRemote: vi.fn().mockReturnValue(false),
    neverGenerateRemote: vi.fn().mockReturnValue(false),
    getRemoteGenerationUrl: vi.fn().mockReturnValue('http://test-url'),
  };
};

export const createOpenAiCacheFactory = (): MockModuleFactory => async (importOriginal) => {
  return {
    ...(await importOriginal()),
    fetchWithCache: vi.fn(),
    enableCache: vi.fn(),
    disableCache: vi.fn(),
  };
};
