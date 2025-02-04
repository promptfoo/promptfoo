import { SingleBar } from 'cli-progress';
import { fetchWithCache } from '../../../src/cache';
import logger from '../../../src/logger';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';
import { shouldGenerateRemote } from '../../../src/redteam/remoteGeneration';
import { addMultilingual } from '../../../src/redteam/strategies/multilingual';
import type { AtomicTestCase } from '../../../src/types';

jest.mock('../../../src/redteam/remoteGeneration', () => ({
  getRemoteGenerationUrl: jest.fn().mockReturnValue('http://test.url'),
  shouldGenerateRemote: jest.fn().mockReturnValue(false),
}));

jest.mock('../../../src/cache', () => ({
  fetchWithCache: jest.fn().mockResolvedValue({
    data: { result: [] },
  }),
}));

jest.spyOn(redteamProviderManager, 'getProvider').mockResolvedValue({
  callApi: jest.fn().mockResolvedValue({ output: '{"translation": "Hallo Welt"}' }),
  config: {},
  getOpenAiBody: jest.fn(),
  modelName: 'test-model',
  id: 'test-provider',
  type: 'openai',
  isAvailable: jest.fn().mockResolvedValue(true),
  validateConfig: jest.fn(),
} as any);

jest.mock('cli-progress', () => ({
  Presets: {
    shades_classic: {},
  },
  SingleBar: jest.fn().mockImplementation(() => ({
    increment: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
  })),
}));

describe('addMultilingual', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetModules();
  });

  it('should preserve harmCategory and modify assertion metrics', async () => {
    const testCase: AtomicTestCase = {
      assert: [{ type: 'promptfoo:redteam:contracts' }, { type: 'promptfoo:redteam:harmful' }],
      metadata: {
        harmCategory: 'Illegal Activities - Fraud & scams',
        otherField: 'value',
      },
      vars: {
        text: 'Hello world',
      },
    };

    const result = await addMultilingual([testCase], 'text', { languages: ['de'] });

    expect(result[0].metadata).toEqual({
      harmCategory: 'Illegal Activities - Fraud & scams',
      otherField: 'value',
    });
    expect(result[0].assert).toEqual([
      {
        metric: 'contracts/Multilingual-DE',
        type: 'promptfoo:redteam:contracts',
      },
      {
        metric: 'harmful/Multilingual-DE',
        type: 'promptfoo:redteam:harmful',
      },
    ]);
  });

  it('should handle test cases without metadata', async () => {
    const testCase: AtomicTestCase = {
      vars: {
        text: 'Hello world',
      },
    };

    const result = await addMultilingual([testCase], 'text', { languages: ['de'] });

    expect(result[0].metadata).toEqual({});
  });

  it('should translate text and update vars correctly', async () => {
    const testCase: AtomicTestCase = {
      vars: {
        otherVar: 'test',
        text: 'Hello world',
      },
    };

    const result = await addMultilingual([testCase], 'text', { languages: ['de'] });

    expect(result[0].vars).toEqual({
      otherVar: 'test',
      text: 'Hallo Welt',
    });
  });

  it('should increment progress bar when provided', async () => {
    const testCase: AtomicTestCase = {
      vars: {
        text: 'Hello world',
      },
    };

    (logger as any).level = 'info';

    await addMultilingual([testCase], 'text', { languages: ['de'] });

    const mockBarInstance = jest.mocked(SingleBar).mock.results[0].value;

    expect(mockBarInstance.increment).toHaveBeenCalledWith(1);
    expect(mockBarInstance.stop).toHaveBeenCalledWith();
  });

  it('should attempt remote generation first', async () => {
    const testCase: AtomicTestCase = {
      vars: { text: 'Hello world' },
    };

    jest.mocked(shouldGenerateRemote).mockReturnValueOnce(true);
    jest.mocked(fetchWithCache).mockResolvedValueOnce({
      cached: false,
      data: {
        result: [
          {
            vars: { text: 'Hallo Welt' },
          },
        ],
      },
      status: 200,
      statusText: 'OK',
    });

    const result = await addMultilingual([testCase], 'text', { languages: ['es'] });

    expect(result).toHaveLength(1);
    expect(result[0].vars?.text).toBe('Hallo Welt');
  });

  it('should preserve harmCategory and modify assertion metrics only for redteam types', async () => {
    const testCase: AtomicTestCase = {
      assert: [{ type: 'promptfoo:redteam:harmful' }, { type: 'moderation' }],
      metadata: {
        harmCategory: 'Illegal Activities - Fraud & scams',
        otherField: 'value',
      },
      vars: {
        text: 'Hello world',
      },
    };

    const result = await addMultilingual([testCase], 'text', { languages: ['de'] });

    expect(result[0].metadata).toEqual({
      harmCategory: 'Illegal Activities - Fraud & scams',
      otherField: 'value',
    });
    expect(result[0].assert).toEqual([
      {
        metric: 'harmful/Multilingual-DE',
        type: 'promptfoo:redteam:harmful',
      },
      {
        type: 'moderation',
      },
    ]);
  });
});
