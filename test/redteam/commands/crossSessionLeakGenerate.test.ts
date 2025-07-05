import { synthesize } from '../../../src/redteam';
import { doGenerateRedteam } from '../../../src/redteam/commands/generate';
import type { RedteamCliGenerateOptions } from '../../../src/redteam/types';
import * as configModule from '../../../src/util/config/load';

jest.mock('../../../src/redteam', () => ({
  synthesize: jest.fn(),
}));
jest.mock('../../../src/util/config/load', () => ({
  resolveConfigs: jest.fn(),
}));
jest.mock('../../../src/util/config/manage', () => ({
  writePromptfooConfig: jest.fn(),
}));
jest.mock('../../../src/providers', () => ({
  loadApiProviders: jest.fn().mockResolvedValue([
    {
      id: () => 'openai:gpt-4',
      callApi: jest.fn(),
      cleanup: jest.fn(),
    },
  ]),
  getProviderIds: jest.fn().mockReturnValue(['openai:gpt-4']),
}));
jest.mock('../../../src/logger', () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('cross-session-leak strategy exclusions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should include cross-session-leak plugin and pass through strategies', async () => {
    jest.mocked(configModule.resolveConfigs).mockResolvedValue({
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

    jest.mocked(synthesize).mockResolvedValue({
      testCases: [],
      purpose: 'p',
      entities: [],
      injectVar: 'input',
    });

    const options: RedteamCliGenerateOptions = {
      output: 'out.yaml',
      cache: true,
      defaultConfig: {},
      write: true,
      config: 'config.yaml',
    } as any;

    await doGenerateRedteam(options);

    const synthOpts = jest.mocked(synthesize).mock.calls[0][0];
    const plugin = synthOpts.plugins.find((p: any) => p.id === 'cross-session-leak');
    expect(plugin).toBeDefined();
    expect(synthOpts.strategies.map((s: any) => s.id)).toEqual(['crescendo', 'goat', 'rot13']);
  });
});
