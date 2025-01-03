import { jest } from '@jest/globals';
import type { OpenAiChatCompletionProvider } from '../../../src/providers/openai';
import {
  renderSystemPrompts,
  evaluateResponse,
  getNewPrompt,
  checkIfOnTopic,
  updateRedteamHistory,
} from '../../../src/redteam/providers/iterativeTree';
import {
  ATTACKER_SYSTEM_PROMPT,
  JUDGE_SYSTEM_PROMPT,
  ON_TOPIC_SYSTEM_PROMPT,
} from '../../../src/redteam/providers/prompts';
import { getTargetResponse } from '../../../src/redteam/providers/shared';
import type { ApiProvider, CallApiContextParams, CallApiOptionsParams } from '../../../src/types';
import { getNunjucksEngine } from '../../../src/util/templates';

jest.mock('../../../src/providers/openai');
jest.mock('../../../src/util/templates');

describe('RedteamIterativeProvider', () => {
  describe('renderSystemPrompts', () => {
    it('should render system prompts correctly', () => {
      const goal = '{{goal}}';
      const result = renderSystemPrompts(getNunjucksEngine(), goal);
      expect(result.redteamSystemPrompt).toBe(ATTACKER_SYSTEM_PROMPT);
      expect(result.onTopicSystemPrompt).toBe(ON_TOPIC_SYSTEM_PROMPT);
      expect(result.judgeSystemPrompt).toBe(JUDGE_SYSTEM_PROMPT);
    });
  });

  describe('evaluateResponse', () => {
    let mockRedteamProvider: jest.Mocked<OpenAiChatCompletionProvider>;

    beforeEach(() => {
      mockRedteamProvider = {
        callApi: jest.fn(),
      } as unknown as jest.Mocked<OpenAiChatCompletionProvider>;
    });

    it('should evaluate response correctly without penalized phrase', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          currentResponse: { rating: 8, explanation: 'Good response' },
          previousBestResponse: { rating: 5, explanation: 'Previous response' },
        }),
      });

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
          currentResponse: { rating: 8, explanation: 'Good but penalized' },
          previousBestResponse: { rating: 5, explanation: 'Previous response' },
        }),
      });

      const { score, explanation } = await evaluateResponse(
        mockRedteamProvider,
        'Judge prompt',
        'Target response',
        'Previous response',
        true,
      );

      expect(score).toBe(5); // 8 - 3 = 5
      expect(explanation).toBe('Good but penalized');
    });

    it('should handle minimum score correctly', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          currentResponse: { rating: 2, explanation: 'Poor response' },
          previousBestResponse: { rating: 1, explanation: 'Previous response' },
        }),
      });

      const { score, explanation } = await evaluateResponse(
        mockRedteamProvider,
        'Judge prompt',
        'Target response',
        'Previous response',
        true,
      );

      expect(score).toBe(1); // 2 - 3, but minimum is 1
      expect(explanation).toBe('Poor response');
    });

    it('should handle missing previous response', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          currentResponse: { rating: 7, explanation: 'First response' },
          previousBestResponse: { rating: 0, explanation: '' },
        }),
      });

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
      } as unknown as jest.Mocked<OpenAiChatCompletionProvider>;
    });

    it('should generate a new prompt correctly', async () => {
      const mockResponse = {
        improvement: 'Improved aspect',
        prompt: 'New prompt',
      };
      mockRedteamProvider.callApi.mockResolvedValue({ output: JSON.stringify(mockResponse) });

      const redteamHistory: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'User message' },
      ];

      const result = await getNewPrompt(mockRedteamProvider, redteamHistory);

      expect(result).toEqual(mockResponse);
      expect(mockRedteamProvider.callApi).toHaveBeenCalledTimes(1);
      expect(mockRedteamProvider.callApi).toHaveBeenCalledWith(
        '[{"role":"system","content":"System prompt"},{"role":"user","content":"User message"}]',
        expect.objectContaining({
          prompt: expect.objectContaining({
            label: 'history',
            raw: '[{"role":"system","content":"System prompt"},{"role":"user","content":"User message"}]',
          }),
        }),
      );
    });

    it('should throw an error for invalid API response', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({ output: 'invalid json' });

      const redteamHistory: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: 'System prompt' },
      ];
      // eslint-disable-next-line jest/require-to-throw-message
      await expect(getNewPrompt(mockRedteamProvider, redteamHistory)).rejects.toThrow();
    });

    it('should handle empty history correctly', async () => {
      const mockResponse = {
        improvement: 'Initial improvement',
        prompt: 'Initial prompt',
      };
      mockRedteamProvider.callApi.mockResolvedValue({ output: JSON.stringify(mockResponse) });

      const result = await getNewPrompt(mockRedteamProvider, []);

      expect(result).toEqual(mockResponse);
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

  describe('checkIfOnTopic', () => {
    let mockRedteamProvider: jest.Mocked<OpenAiChatCompletionProvider>;

    beforeEach(() => {
      mockRedteamProvider = {
        callApi: jest.fn(),
      } as unknown as jest.Mocked<OpenAiChatCompletionProvider>;
    });

    it('should return true for on-topic prompt', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({ output: JSON.stringify({ onTopic: true }) });

      const result = await checkIfOnTopic(
        mockRedteamProvider,
        'On-topic system prompt',
        'Target prompt',
      );

      expect(result).toMatchObject({ isOnTopic: true });
      expect(mockRedteamProvider.callApi).toHaveBeenCalledTimes(1);
      expect(mockRedteamProvider.callApi).toHaveBeenCalledWith(
        '[{"role":"system","content":"On-topic system prompt"},{"role":"user","content":"Target prompt"}]',
        expect.objectContaining({
          prompt: expect.objectContaining({
            label: 'on-topic',
            raw: '[{"role":"system","content":"On-topic system prompt"},{"role":"user","content":"Target prompt"}]',
          }),
        }),
      );
    });

    it('should return false for off-topic prompt', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({ output: JSON.stringify({ onTopic: false }) });

      const result = await checkIfOnTopic(
        mockRedteamProvider,
        'On-topic system prompt',
        'Off-topic prompt',
      );

      expect(result).toMatchObject({ isOnTopic: false });
    });

    it('should throw an error for invalid API response', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({ output: 'invalid json' });

      await expect(
        checkIfOnTopic(mockRedteamProvider, 'On-topic system prompt', 'Target prompt'),
      ).rejects.toThrow(); // eslint-disable-line jest/require-to-throw-message
    });

    it('should throw an error for unexpected API response format', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({ unexpectedKey: true }),
      });

      await expect(
        checkIfOnTopic(mockRedteamProvider, 'On-topic system prompt', 'Target prompt'),
      ).rejects.toThrow('Invariant failed: Expected onTopic to be a boolean');
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
      expect(result.content).toContain(`OBJECTIVE: ${goal}`);
      expect(result.content).toContain(`SCORE: ${score}`);
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
      expect(result.content).toContain(`OBJECTIVE: ${goal}`);
      expect(result.content).toContain(
        `SCORE: ${score} (your prompt was off-topic) (contains penalized phrase)`,
      );
    });

    it('should handle edge case scores', () => {
      const targetResponse = 'Edge case response';
      const goal = 'Test goal';
      const score = 10; // Maximum score
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
        content: expect.stringContaining('LANGUAGE MODEL OUTPUT: Edge case response'),
      });
      expect(result.content).toContain(`SCORE: ${score}`);
    });

    it('should handle minimum score', () => {
      const targetResponse = 'Minimum score response';
      const goal = 'Test goal';
      const score = 0; // Minimum score
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
        content: expect.stringContaining('LANGUAGE MODEL OUTPUT: Minimum score response'),
      });
      expect(result.content).toContain(`SCORE: ${score}`);
    });
  });

  describe('getTargetResponse', () => {
    let mockTargetProvider: jest.Mocked<ApiProvider>;

    beforeEach(() => {
      mockTargetProvider = {
        callApi: jest.fn(),
      } as unknown as jest.Mocked<ApiProvider>;
    });

    it('should get target response correctly', async () => {
      const mockResponse = { output: 'Target response' };
      mockTargetProvider.callApi.mockResolvedValue({ output: mockResponse });

      const targetPrompt = 'Test prompt';
      const context: CallApiContextParams = {
        prompt: { label: 'test', raw: targetPrompt },
        vars: {},
      };
      const options: CallApiOptionsParams = {};
      const result = await getTargetResponse(mockTargetProvider, targetPrompt, context, options);

      expect(result).toEqual({
        output: JSON.stringify(mockResponse),
        sessionId: undefined,
        tokenUsage: { numRequests: 1 },
      });
      expect(mockTargetProvider.callApi).toHaveBeenCalledTimes(1);
      expect(mockTargetProvider.callApi).toHaveBeenCalledWith(targetPrompt, context, options);
    });

    it('should stringify non-string outputs', async () => {
      const nonStringOutput = { key: 'value' };
      mockTargetProvider.callApi.mockResolvedValue({ output: nonStringOutput });

      const targetPrompt = 'Test prompt';
      const result = await getTargetResponse(
        mockTargetProvider,
        targetPrompt,
        {} as CallApiContextParams,
        {} as CallApiOptionsParams,
      );

      expect(result).toEqual({
        output: JSON.stringify(nonStringOutput),
        sessionId: undefined,
        tokenUsage: { numRequests: 1 },
      });
    });
  });
});
