import { beforeEach, describe, expect, it, vi } from 'vitest';
import { doGenerateRedteam } from '../../../src/redteam/commands/generate';
import { synthesize } from '../../../src/redteam/index';
import * as configModule from '../../../src/util/config/load';

import type { RedteamCliGenerateOptions } from '../../../src/redteam/types';

vi.mock('../../../src/redteam', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    synthesize: vi.fn(),
  };
});
vi.mock('../../../src/util/config/load', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    resolveConfigs: vi.fn(),
  };
});
vi.mock('../../../src/util/config/writer', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    writePromptfooConfig: vi.fn(),
  };
});
vi.mock('../../../src/providers', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    loadApiProviders: vi.fn().mockResolvedValue([
      {
        id: () => 'openai:gpt-4',
        callApi: vi.fn(),
        cleanup: vi.fn(),
      },
    ]),

    getProviderIds: vi.fn().mockReturnValue(['openai:gpt-4']),
  };
});
vi.mock('../../../src/logger', () => ({
  __esModule: true,
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('cross-session-leak strategy exclusions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should include cross-session-leak plugin and pass through strategies', async () => {
    vi.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/path',
      testSuite: {
        prompts: [{ raw: 'Test prompt' }],
        providers: [{ id: 'openai:gpt-4' }],
        tests: [],
      },
      config: {
        providers: ['openai:gpt-4'],
        redteam: {
          plugins: ['cross-session-leak'],
          strategies: ['crescendo', 'goat', 'rot13'],
          numTests: 1,
        },
      },
    } as any);

    vi.mocked(synthesize).mockResolvedValue({
      testCases: [],
      purpose: 'p',
      entities: [],
      injectVar: 'input',
      failedPlugins: [],
    });

    const options: RedteamCliGenerateOptions = {
      output: 'out.yaml',
      cache: true,
      defaultConfig: {},
      write: true,
      config: 'config.yaml',
    } as any;

    await doGenerateRedteam(options);

    const synthOpts = vi.mocked(synthesize).mock.calls[0][0];
    const plugin = synthOpts.plugins.find((p: any) => p.id === 'cross-session-leak');
    expect(plugin).toBeDefined();
    expect(synthOpts.strategies.map((s: any) => s.id)).toEqual(['crescendo', 'goat', 'rot13']);
  });
});
