// Shared mock setup and lifecycle hooks for all HTTP provider test files.
import { afterAll, afterEach, beforeEach, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { runPython } from '../../../src/python/pythonUtils';
import { maybeLoadConfigFromExternalFile, maybeLoadFromExternalFile } from '../../../src/util/file';
import { functionCache } from '../../../src/util/functions/loadFunction';

// Mock console.warn to prevent test noise
const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(function () {});

vi.mock('../../../src/cache', async () => {
  const actual = await vi.importActual<typeof import('../../../src/cache')>('../../../src/cache');
  return {
    ...actual,
    fetchWithCache: vi.fn(),
  };
});

vi.mock('../../../src/util/fetch/index.ts', async () => {
  const actual = await vi.importActual<typeof import('../../../src/util/fetch/index.ts')>(
    '../../../src/util/fetch/index.ts',
  );
  return {
    ...actual,
    fetchWithRetries: vi.fn(),
    fetchWithTimeout: vi.fn(),
  };
});

vi.mock('../../../src/util/file', async () => {
  const actual =
    await vi.importActual<typeof import('../../../src/util/file')>('../../../src/util/file');
  return {
    ...actual,
    maybeLoadFromExternalFile: vi.fn((input) => input),
    maybeLoadConfigFromExternalFile: vi.fn((input) => input),
  };
});

vi.mock('../../../src/esm', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    importModule: vi.fn(async (_modulePath: string, functionName?: string) => {
      const mockModule: Record<string, ReturnType<typeof vi.fn>> = {
        default: vi.fn((data) => data.defaultField),
        parseResponse: vi.fn((data) => data.specificField),
      };
      if (functionName) {
        if (!(functionName in mockModule)) {
          throw new Error(
            `importModule mock: unexpected functionName "${functionName}". ` +
              'Add it to the mockModule in setup.ts or use mockResolvedValueOnce.',
          );
        }
        return mockModule[functionName];
      }
      return mockModule.default;
    }),
  };
});

vi.mock('../../../src/cliState', async () => {
  const actual =
    await vi.importActual<typeof import('../../../src/cliState')>('../../../src/cliState');
  const mockState = { basePath: '/mock/base/path', config: {} };
  return {
    ...actual,
    ...mockState,
    default: mockState,
  };
});

vi.mock('../../../src/python/pythonUtils', async () => {
  const actual = await vi.importActual<typeof import('../../../src/python/pythonUtils')>(
    '../../../src/python/pythonUtils',
  );
  return {
    ...actual,
    runPython: vi.fn(),
  };
});

// Mock jks-js module for JKS keystore tests in auth.test.ts - don't use importOriginal as the native module may fail to load
vi.mock('jks-js', () => ({
  toPem: vi.fn(),
  default: {
    toPem: vi.fn(),
  },
}));

afterAll(() => {
  consoleSpy.mockRestore();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchWithCache).mockReset();
  vi.mocked(maybeLoadFromExternalFile).mockReset();
  vi.mocked(maybeLoadConfigFromExternalFile).mockReset();
  vi.mocked(runPython).mockReset();
  vi.mocked(fetchWithCache).mockImplementation(() => {
    throw new Error(
      'fetchWithCache called without mockResolvedValueOnce setup. ' +
        'Add vi.mocked(fetchWithCache).mockResolvedValueOnce({...}) before calling provider.callApi().',
    );
  });
  vi.mocked(maybeLoadFromExternalFile).mockImplementation(function (input: unknown) {
    return input;
  });
  vi.mocked(maybeLoadConfigFromExternalFile).mockImplementation(function (input: unknown) {
    return input;
  });
  Object.keys(functionCache).forEach((key) => {
    delete functionCache[key];
  });
});

afterEach(() => {
  vi.resetAllMocks();
});
