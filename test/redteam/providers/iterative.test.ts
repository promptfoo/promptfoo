import { jest } from '@jest/globals';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai';
import RedteamIterativeProvider, {
  renderSystemPrompts,
} from '../../../src/redteam/providers/iterative';
import { getNunjucksEngine } from '../../../src/util/templates';

// Mock dependencies
jest.mock('../../../src/providers/openai');
jest.mock('../../../src/logger');

describe('RedteamIterativeProvider', () => {
  let provider: RedteamIterativeProvider;
  let mockOpenAiProvider: jest.Mocked<OpenAiChatCompletionProvider>;

  beforeEach(() => {
    jest.clearAllMocks();
    const mockProvider = { callApi: jest.fn(), id: jest.fn().mockReturnValue('mock-provider') };

    mockOpenAiProvider = new OpenAiChatCompletionProvider(
      '',
    ) as jest.Mocked<OpenAiChatCompletionProvider>;
    const mockInitializeProviders = jest.fn().mockResolvedValue(mockProvider);
    provider = new RedteamIterativeProvider({ injectVar: 'goal' }, mockInitializeProviders as any);
  });

  describe('constructor', () => {
    it('should create an instance with valid config', () => {
      expect(provider).toBeInstanceOf(RedteamIterativeProvider);
    });

    it('should throw an error if injectVar is not set', () => {
      expect(() => new RedteamIterativeProvider({})).toThrow('Expected injectVar to be set');
    });
  });

  describe('id', () => {
    it('should return the correct provider id', () => {
      expect(provider.id()).toBe('promptfoo:redteam:iterative');
    });
  });

  describe('callApi', () => {
    it('should run the red team conversation and return the best response', async () => {
      const mockContext = {
        originalProvider: {
          callApi: jest.mocked(jest.fn().mockResolvedValue({ output: 'Target response' })),
        },
        vars: { goal: 'Test goal' },
        prompt: { text: 'Test prompt', raw: 'Test prompt', label: 'Test label' },
        filters: undefined,
      };

      mockOpenAiProvider.callApi
        .mockResolvedValueOnce({
          output: JSON.stringify({ improvement: 'Improvement', prompt: 'New prompt' }),
        })
        .mockResolvedValueOnce({ output: JSON.stringify({ isOnTopic: true }) })
        .mockResolvedValueOnce({ output: JSON.stringify({ rating: 8 }) });

      const result = await provider.callApi('', mockContext);

      expect(result).toEqual({
        output: 'Target response',
        metadata: { redteamFinalPrompt: expect.any(String) },
      });
    });

    it('should throw an error if originalProvider is not set', async () => {
      await expect(provider.callApi('', {})).rejects.toThrow('Expected originalProvider to be set');
    });

    it('should throw an error if vars is not set', async () => {
      await expect(provider.callApi('', { originalProvider: {} })).rejects.toThrow(
        'Expected vars to be set',
      );
    });
  });
});

describe('renderSystemPrompts', () => {
  it('should render system prompts correctly', () => {
    const nunjucks = getNunjucksEngine();
    const goal = 'Test goal';

    const result = renderSystemPrompts(nunjucks, goal);

    expect(result).toEqual({
      redteamSystemPrompt: expect.stringContaining(goal),
      onTopicSystemPrompt: expect.stringContaining(goal),
      judgeSystemPrompt: expect.stringContaining(goal),
    });
  });
});

// Add more tests for other functions like evaluateResponse, getNewPrompt, checkIfOnTopic, etc.
