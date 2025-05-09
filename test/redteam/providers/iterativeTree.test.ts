import { jest } from '@jest/globals';
import type { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import {
  evaluateResponse,
  getNewPrompt,
  renderSystemPrompts,
  updateRedteamHistory,
} from '../../../src/redteam/providers/iterativeTree';

const mockNunjucks = {
  renderString: jest.fn(),
} as any;

jest.mock('../../../src/util/templates', () => ({
  getNunjucksEngine: jest.fn().mockReturnValue(mockNunjucks),
}));

describe('RedteamIterativeProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('renderSystemPrompts', () => {
    it('should render prompts with purpose', () => {
      mockNunjucks.renderString
        .mockReturnValueOnce('attacker prompt')
        .mockReturnValueOnce('on topic prompt')
        .mockReturnValueOnce('judge prompt');

      const result = renderSystemPrompts(mockNunjucks, 'test goal', 'test purpose');

      expect(mockNunjucks.renderString).toHaveBeenCalledTimes(3);
      expect(mockNunjucks.renderString.mock.calls[0][1]).toEqual({
        goal: 'test goal',
        purpose: 'test purpose',
      });
      expect(result).toEqual({
        redteamSystemPrompt: 'attacker prompt',
        onTopicSystemPrompt: 'on topic prompt',
        judgeSystemPrompt: 'judge prompt',
      });
    });

    it('should render prompts without purpose', () => {
      mockNunjucks.renderString
        .mockReturnValueOnce('attacker prompt')
        .mockReturnValueOnce('on topic prompt')
        .mockReturnValueOnce('judge prompt');

      const result = renderSystemPrompts(mockNunjucks, 'test goal');

      expect(mockNunjucks.renderString).toHaveBeenCalledTimes(3);
      expect(mockNunjucks.renderString.mock.calls[0][1]).toEqual({
        goal: 'test goal',
        purpose: undefined,
      });
      expect(result).toEqual({
        redteamSystemPrompt: 'attacker prompt',
        onTopicSystemPrompt: 'on topic prompt',
        judgeSystemPrompt: 'judge prompt',
      });
    });
  });

  describe('evaluateResponse', () => {
    let mockRedteamProvider: jest.Mocked<OpenAiChatCompletionProvider>;

    beforeEach(() => {
      mockRedteamProvider = {
        callApi: jest.fn(),
        id: () => 'mock',
      } as any;
    });

    it('should evaluate response correctly without penalized phrase', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          currentResponse: { rating: 8, explanation: 'Good response' },
          previousBestResponse: { rating: 5, explanation: 'Previous response' },
        }),
      } as any);

      const { score, explanation } = await evaluateResponse(
        mockRedteamProvider,
        'Judge prompt',
        'Target response',
        'Previous response',
        false,
      );

      expect(score).toBe(8);
      expect(explanation).toBe('Good response');
      expect(mockRedteamProvider.callApi).toHaveBeenCalledTimes(1);
      expect(mockRedteamProvider.callApi).toHaveBeenCalledWith(
        expect.stringContaining('Current Response'),
        expect.objectContaining({
          prompt: expect.objectContaining({
            label: 'judge',
          }),
        }),
      );
    });

    it('should apply penalty for penalized phrases', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          currentResponse: { rating: 8, explanation: 'Good response' },
          previousBestResponse: { rating: 5, explanation: 'Previous response' },
        }),
      } as any);

      const { score, explanation } = await evaluateResponse(
        mockRedteamProvider,
        'Judge prompt',
        'Target response',
        'Previous response',
        true,
      );

      expect(score).toBe(5); // 8 - 3 = 5 after penalty
      expect(explanation).toBe('Good response');
    });

    it('should handle minimum score correctly', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          currentResponse: { rating: 2, explanation: 'Poor response' },
          previousBestResponse: { rating: 1, explanation: 'Previous response' },
        }),
      } as any);

      const { score, explanation } = await evaluateResponse(
        mockRedteamProvider,
        'Judge prompt',
        'Target response',
        'Previous response',
        true,
      );

      expect(score).toBe(1);
      expect(explanation).toBe('Poor response');
    });

    it('should handle missing previous response', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          currentResponse: { rating: 7, explanation: 'First response' },
          previousBestResponse: { rating: 0, explanation: '' },
        }),
      } as any);

      const { score, explanation } = await evaluateResponse(
        mockRedteamProvider,
        'Judge prompt',
        'Target response',
        '',
        false,
      );

      expect(score).toBe(7);
      expect(explanation).toBe('First response');
      expect(JSON.parse(mockRedteamProvider.callApi.mock.calls[0][0])).toEqual([
        {
          role: 'system',
          content: 'Judge prompt',
        },
        {
          role: 'user',
          content: expect.stringContaining('Previous Best Response:\nNone'),
        },
      ]);
    });
  });

  describe('getNewPrompt', () => {
    let mockRedteamProvider: jest.Mocked<OpenAiChatCompletionProvider>;

    beforeEach(() => {
      mockRedteamProvider = {
        callApi: jest.fn(),
        id: () => 'mock',
      } as any;
    });

    it('should generate a new prompt correctly', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          improvement: 'Improved aspect',
          prompt: 'New prompt',
        }),
      } as any);

      const redteamHistory = [
        { role: 'system' as const, content: 'System prompt' },
        { role: 'user' as const, content: 'User message' },
      ];

      const result = await getNewPrompt(mockRedteamProvider, redteamHistory);

      expect(result).toEqual({
        improvement: 'Improved aspect',
        prompt: 'New prompt',
      });
      expect(mockRedteamProvider.callApi).toHaveBeenCalledWith(
        JSON.stringify(redteamHistory),
        expect.objectContaining({
          prompt: expect.objectContaining({
            label: 'history',
            raw: JSON.stringify(redteamHistory),
          }),
        }),
      );
    });

    it('should handle empty history correctly', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          improvement: 'Improved aspect',
          prompt: 'New prompt',
        }),
      } as any);

      const result = await getNewPrompt(mockRedteamProvider, []);

      expect(result).toEqual({
        improvement: 'Improved aspect',
        prompt: 'New prompt',
      });
      expect(mockRedteamProvider.callApi).toHaveBeenCalledWith(
        '[]',
        expect.objectContaining({
          prompt: expect.objectContaining({
            label: 'history',
            raw: '[]',
          }),
        }),
      );
    });
  });

  describe('updateRedteamHistory', () => {
    it('should create a new history entry with correct content', () => {
      const targetResponse = 'Test response';
      const goal = 'Test goal';
      const score = 7;
      const isOnTopic = true;
      const containsPenalizedPhrase = false;

      const result = updateRedteamHistory(
        targetResponse,
        goal,
        score,
        isOnTopic,
        containsPenalizedPhrase,
      );

      expect(result).toEqual({
        role: 'user',
        content: expect.stringContaining('LANGUAGE MODEL OUTPUT: Test response'),
      });
      expect(result.content).toContain('OBJECTIVE: Test goal');
      expect(result.content).toContain('SCORE: 7');
      expect(result.content).not.toContain('(your prompt was off-topic)');
      expect(result.content).not.toContain('(contains penalized phrase)');
    });

    it('should handle off-topic and penalized responses', () => {
      const targetResponse = 'Off-topic response';
      const goal = 'Test goal';
      const score = 3;
      const isOnTopic = false;
      const containsPenalizedPhrase = true;

      const result = updateRedteamHistory(
        targetResponse,
        goal,
        score,
        isOnTopic,
        containsPenalizedPhrase,
      );

      expect(result).toEqual({
        role: 'user',
        content: expect.stringContaining('LANGUAGE MODEL OUTPUT: Off-topic response'),
      });
      expect(result.content).toContain('OBJECTIVE: Test goal');
      expect(result.content).toContain(
        'SCORE: 3 (your prompt was off-topic) (contains penalized phrase)',
      );
    });
  });
});
