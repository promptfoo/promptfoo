import { doGenerateRedteam } from '../../../src/redteam/commands/generate';
import { synthesize } from '../../../src/redteam';
import * as configModule from '../../../src/util/config/load';
import { writePromptfooConfig } from '../../../src/util/config/manage';
import type { RedteamCliGenerateOptions } from '../../../src/redteam/types';

jest.mock('../../../src/redteam', () => ({
  synthesize: jest.fn(),
}));
jest.mock('../../../src/util/config/load', () => ({
  resolveConfigs: jest.fn(),
}));
jest.mock('../../../src/util/config/manage', () => ({
  writePromptfooConfig: jest.fn(),
}));
jest.mock('../../../src/logger', () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('cross-session-leak strategy exclusions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should set excludeStrategies for cross-session-leak plugin', async () => {
    jest.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/path',
      testSuite: { prompts: [{ raw: 'Test prompt' }], providers: [], tests: [] },
      config: {
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
    expect(plugin.config.excludeStrategies).toEqual(['crescendo', 'goat']);
    expect(synthOpts.strategies.map((s: any) => s.id)).toEqual([
      'crescendo',
      'goat',
      'rot13',
    ]);
  });
});
