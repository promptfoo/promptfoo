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
      LANGFUSE_BASE_URL: undefined,
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

  it('uses LANGFUSE_BASE_URL from the config env block when LANGFUSE_HOST is not set', async () => {
    cliState.config = {
      env: {
        LANGFUSE_PUBLIC_KEY: 'pk-base-url',
        LANGFUSE_SECRET_KEY: 'sk-base-url',
        LANGFUSE_BASE_URL: 'https://us.cloud.langfuse.com',
      },
    };

    await expect(getPrompt('greeting', {}, 'text')).resolves.toBe('compiled');

    expect(mocks.constructorCalls).toEqual([
      {
        publicKey: 'pk-base-url',
        secretKey: 'sk-base-url',
        baseUrl: 'https://us.cloud.langfuse.com',
      },
    ]);
  });

  it('prefers LANGFUSE_HOST over LANGFUSE_BASE_URL', async () => {
    cliState.config = {
      env: {
        LANGFUSE_PUBLIC_KEY: 'pk-both',
        LANGFUSE_SECRET_KEY: 'sk-both',
        LANGFUSE_HOST: 'https://host.example.com',
        LANGFUSE_BASE_URL: 'https://base-url.example.com',
      },
    };

    await expect(getPrompt('greeting', {}, 'text')).resolves.toBe('compiled');

    expect(mocks.constructorCalls).toEqual([
      {
        publicKey: 'pk-both',
        secretKey: 'sk-both',
        baseUrl: 'https://host.example.com',
      },
    ]);
  });
});
