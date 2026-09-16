import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { getPrompt } from '../../src/integrations/helicone';
import { fetchWithProxy } from '../../src/util/fetch/index';
import { mockProcessEnv } from '../util/utils';

vi.mock('../../src/util/fetch/index', () => ({
  fetchWithProxy: vi.fn(),
}));

function mockHeliconeResponse(body: unknown) {
  vi.mocked(fetchWithProxy).mockResolvedValue({ json: async () => body } as unknown as Response);
}

function getRequest() {
  const [url, init] = vi.mocked(fetchWithProxy).mock.calls[0];
  return {
    url,
    headers: init?.headers as Record<string, string>,
    body: JSON.parse(init?.body as string),
  };
}

// Uses the real getEnvString and cliState. The CLI populates both sources after the integration is
// imported: `--env-file` into process.env, `env:` into cliState.config.
describe('helicone integration', () => {
  let originalConfig: typeof cliState.config;
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.resetAllMocks();
    originalConfig = cliState.config;
    cliState.config = undefined;
    restoreEnv = mockProcessEnv({ HELICONE_API_KEY: undefined });
  });

  afterEach(() => {
    cliState.config = originalConfig;
    restoreEnv();
  });

  it('compiles a prompt using an API key set after the module is imported', async () => {
    mockProcessEnv({ HELICONE_API_KEY: 'env-file-key' });
    mockHeliconeResponse({ data: { prompt_compiled: 'Hello Ada' }, error: null });

    await expect(getPrompt('my-prompt', { name: 'Ada' })).resolves.toBe('Hello Ada');

    expect(getRequest()).toEqual({
      url: 'https://api.helicone.ai/v1/prompt/my-prompt/compile',
      headers: { Authorization: 'Bearer env-file-key', 'Content-Type': 'application/json' },
      body: { filter: {}, inputs: { name: 'Ada' } },
    });
  });

  it('prefers the config env block over a shell-exported API key', async () => {
    mockProcessEnv({ HELICONE_API_KEY: 'shell-key' });
    cliState.config = { env: { HELICONE_API_KEY: 'config-key' } };
    mockHeliconeResponse({ data: { prompt_compiled: 'compiled' }, error: null });

    await getPrompt('my-prompt', {});

    expect(getRequest().headers.Authorization).toBe('Bearer config-key');
  });

  it.each([
    {
      version: 'major only',
      major: 5,
      minor: undefined,
      filter: {
        left: { prompts_versions: { major_version: { equals: 5 } } },
        operator: 'and',
        right: 'all',
      },
    },
    {
      version: 'minor only',
      major: undefined,
      minor: 2,
      filter: {
        left: { prompts_versions: { minor_version: { equals: 2 } } },
        operator: 'and',
        right: 'all',
      },
    },
    {
      version: 'major and minor',
      major: 5,
      minor: 2,
      filter: {
        left: { prompts_versions: { major_version: { equals: 5 } } },
        operator: 'and',
        right: { prompts_versions: { minor_version: { equals: 2 } } },
      },
    },
  ])('filters by $version version', async ({ major, minor, filter }) => {
    mockHeliconeResponse({ data: { prompt_compiled: 'compiled' }, error: null });

    await getPrompt('my-prompt', {}, major, minor);

    expect(getRequest().body.filter).toEqual(filter);
  });

  it('throws the error returned by Helicone', async () => {
    mockHeliconeResponse({ data: null, error: 'Prompt not found' });

    await expect(getPrompt('missing', {})).rejects.toThrow('Prompt not found');
  });
});
