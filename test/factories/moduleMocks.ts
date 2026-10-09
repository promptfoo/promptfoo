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

export const createLocalGenerationFactory = (): MockModuleFactory => async (importOriginal) => {
  return {
    ...(await importOriginal()),
    shouldGenerateRemote: vi.fn().mockReturnValue(false),
    neverGenerateRemote: vi.fn().mockReturnValue(false),
    getRemoteGenerationUrl: vi.fn().mockReturnValue('http://test-url'),
  };
};
export const createUuidModuleFactory = (): MockModuleFactory => () => ({
  isUuid: vi.fn((str: string) => {
    // Check if the string looks like a UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }),
});
