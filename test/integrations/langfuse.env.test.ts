import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { getPrompt } from '../../src/integrations/langfuse';
import { mockProcessEnv } from '../util/utils';

const mocks = vi.hoisted(() => {
  const constructorCalls: unknown[] = [];
  const mockGetPrompt = vi.fn();

  class MockLangfuseClient {
    prompt = { get: mockGetPrompt };

    constructor(params: unknown) {
      constructorCalls.push(params);
    }
  }

  return { constructorCalls, mockGetPrompt, MockLangfuseClient };
});

vi.mock('@langfuse/client', () => ({
  LangfuseClient: mocks.MockLangfuseClient,
}));

// Unlike langfuse.test.ts, this uses the real getEnvString and cliState. The CLI populates both
// sources after the integration is imported: `--env-file` into process.env, `env:` into cliState.config.
describe('langfuse integration env resolution', () => {
  let originalConfig: typeof cliState.config;
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.constructorCalls.length = 0;
    mocks.mockGetPrompt.mockResolvedValue({ compile: () => 'compiled' });
    originalConfig = cliState.config;
    cliState.config = undefined;
    restoreEnv = mockProcessEnv({
      LANGFUSE_PUBLIC_KEY: undefined,
      LANGFUSE_SECRET_KEY: undefined,
      LANGFUSE_HOST: undefined,
    });
  });

  afterEach(() => {
    cliState.config = originalConfig;
    restoreEnv();
  });

  it('uses process.env values set after the module is imported', async () => {
    mockProcessEnv({
      LANGFUSE_PUBLIC_KEY: 'pk-env-file',
      LANGFUSE_SECRET_KEY: 'sk-env-file',
      LANGFUSE_HOST: 'https://env-file.example.com',
    });

    await expect(getPrompt('greeting', {}, 'text')).resolves.toBe('compiled');

    expect(mocks.constructorCalls).toEqual([
      {
        publicKey: 'pk-env-file',
        secretKey: 'sk-env-file',
        baseUrl: 'https://env-file.example.com',
      },
    ]);
  });

  it('prefers the config env block over shell-exported values', async () => {
    mockProcessEnv({
      LANGFUSE_PUBLIC_KEY: 'pk-shell',
      LANGFUSE_SECRET_KEY: 'sk-shell',
      LANGFUSE_HOST: 'https://shell.example.com',
    });
    cliState.config = {
      env: {
        LANGFUSE_PUBLIC_KEY: 'pk-config',
        LANGFUSE_SECRET_KEY: 'sk-config',
        LANGFUSE_HOST: 'https://config.example.com',
      },
    };

    await expect(getPrompt('greeting', {}, 'text')).resolves.toBe('compiled');

    expect(mocks.constructorCalls).toEqual([
      {
        publicKey: 'pk-config',
        secretKey: 'sk-config',
        baseUrl: 'https://config.example.com',
      },
    ]);
  });
});
