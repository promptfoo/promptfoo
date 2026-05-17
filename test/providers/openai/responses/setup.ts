// Shared harness for the split OpenAI responses provider tests.
//
// Each split test file must import this module with a bare side-effect
// import (`import './setup';`) BEFORE importing the modules under test, so
// the `vi.mock` calls below register against the worker's module registry
// before `src/cache` / `src/logger` / `src/python/pythonUtils` load.
//
// The top-level `beforeEach` / `afterEach` hooks register into the importing
// file's test context because `vitest.config.ts` sets `isolate: true`, which
// re-evaluates this module for every test file. If that flag is ever
// disabled, the hooks would register only once per worker (in the first
// file that imports this module) and env/mocks would silently leak across
// files — update this harness before flipping it.
import { afterEach, beforeEach, vi } from 'vitest';
import { mockProcessEnv } from '../../../util/utils';

vi.mock('../../../../src/cache', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    fetchWithCache: vi.fn(),
  };
});

vi.mock('../../../../src/logger', () => ({
  __esModule: true,
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../../src/python/pythonUtils', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    runPython: vi.fn(),
  };
});

const ENV_KEYS_TO_CLEAR = [
  'OPENAI_TEMPERATURE',
  'OPENAI_MAX_TOKENS',
  'OPENAI_MAX_COMPLETION_TOKENS',
  'OPENAI_API_BASE_URL',
  'OPENAI_BASE_URL',
  'OPENAI_API_HOST',
] as const;

type OpenAiEnvKey = (typeof ENV_KEYS_TO_CLEAR)[number];

let restoreOpenAiEnv = () => {};

function resetOpenAiEnv(overrides: Partial<Record<OpenAiEnvKey, string | undefined>> = {}) {
  restoreOpenAiEnv();
  restoreOpenAiEnv = mockProcessEnv({
    ...Object.fromEntries(ENV_KEYS_TO_CLEAR.map((key) => [key, undefined])),
    ...overrides,
  });
}

export function setOpenAiEnv(overrides: Partial<Record<OpenAiEnvKey, string | undefined>>) {
  resetOpenAiEnv(overrides);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetOpenAiEnv();
});

afterEach(() => {
  vi.resetAllMocks();
  restoreOpenAiEnv();
  restoreOpenAiEnv = () => {};
});
