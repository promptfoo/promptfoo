import { fetchWithCache } from '../../../src/cache';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';
import { shouldGenerateRemote } from '../../../src/redteam/remoteGeneration';
import { addMultilingual } from '../../../src/redteam/strategies/multilingual';
import type { TestCase } from '../../../src/types';

// Mock cli-progress
jest.mock('cli-progress', () => ({
  Presets: { shades_classic: {} },
  SingleBar: jest.fn(() => ({
    start: jest.fn(),
    increment: jest.fn(),
    stop: jest.fn(),
    update: jest.fn(),
  })),
}));

// Mock logger
jest.mock('../../../src/logger', () => ({
  level: 'info',
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}));

// Mock remote generation
jest.mock('../../../src/redteam/remoteGeneration', () => ({
  getRemoteGenerationUrl: jest.fn().mockReturnValue('http://test.url'),
  shouldGenerateRemote: jest.fn().mockReturnValue(false),
}));

// Mock cache
jest.mock('../../../src/cache', () => ({
  fetchWithCache: jest.fn().mockResolvedValue({
    data: { result: [] },
    cached: false,
    status: 200,
    statusText: 'OK',
  }),
}));

// Mock redteamProviderManager
jest.mock('../../../src/redteam/providers/shared', () => ({
  redteamProviderManager: {
    getProvider: jest.fn().mockResolvedValue({
      callApi: jest.fn().mockResolvedValue({
        output: '{"de": "Hallo Welt"}',
      }),
      config: {},
      isAvailable: jest.fn().mockResolvedValue(true),
    }),
  },
}));

describe('Multilingual Strategy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should translate text and update metadata', async () => {
    const testCase: TestCase = {
      vars: { text: 'Hello world' },
      assert: [{ type: 'promptfoo:redteam:harmful' }],
      metadata: { harmCategory: 'Test' },
    };

    const result = await addMultilingual([testCase], 'text', { languages: ['de'] });

    expect(result).toHaveLength(1);
    expect(result[0].metadata).toMatchObject({
      harmCategory: 'Test',
      strategyId: 'multilingual',
      language: 'de',
    });
    expect(result[0].vars?.text).toBe('Hallo Welt');
  });

  it('should use remote generation when available', async () => {
    // Setup mock to use remote generation
    const remoteResult = [{ vars: { text: 'Remote result' } }];
    jest.mocked(shouldGenerateRemote).mockReturnValueOnce(true);
    jest.mocked(fetchWithCache).mockResolvedValueOnce({
      data: { result: remoteResult },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const result = await addMultilingual([{ vars: { text: 'Test' } }], 'text', {});

    expect(result).toEqual(remoteResult);
    expect(fetchWithCache).toHaveBeenCalledWith(
      'http://test.url',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: expect.any(String),
      }),
      expect.any(Number),
    );
  });

  it('should support multiple languages', async () => {
    // Setup mock for multiple languages
    const mockProvider = jest.mocked(redteamProviderManager.getProvider);
    mockProvider.mockResolvedValueOnce({
      callApi: jest.fn().mockResolvedValue({
        output: '{"es": "Hola mundo", "fr": "Bonjour le monde"}',
      }),
      config: {},
      isAvailable: jest.fn().mockResolvedValue(true),
    } as any);

    const result = await addMultilingual([{ vars: { text: 'Hello world' } }], 'text', {
      languages: ['es', 'fr'],
    });

    expect(result).toHaveLength(2);
    const languages = result.map((tc) => tc.metadata?.language);
    expect(languages).toContain('es');
    expect(languages).toContain('fr');

    // Check translations
    const translations = result.map((tc) => tc.vars?.text);
    expect(translations).toContain('Hola mundo');
    expect(translations).toContain('Bonjour le monde');
  });
});
