import { jest } from '@jest/globals';
import type { OpenAiChatCompletionProvider } from '../../../src/providers/openai';
import type { TreeNode } from '../../../src/redteam/providers/iterativeTree';
import {
  renderSystemPrompts,
  calculateBranches,
  calculateSimilarity,
  selectDiverseBestNodes,
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
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  TokenUsage,
} from '../../../src/types';
import { getNunjucksEngine } from '../../../src/util/templates';

const mockTokenUsage: TokenUsage = {
  total: 100,
  prompt: 50,
  completion: 50,
  numRequests: 1,
  cached: 0,
};

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
        tokenUsage: mockTokenUsage,
      });

      const result = await evaluateResponse(
        mockRedteamProvider,
        'Judge prompt',
        'Target response',
        'Previous response',
        false,
      );

      expect(result).toEqual({
        score: 8,
        explanation: 'Good response',
        tokenUsage: mockTokenUsage,
      });
    });

    it('should apply penalty for penalized phrases', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          currentResponse: { rating: 8, explanation: 'Good but penalized' },
          previousBestResponse: { rating: 5, explanation: 'Previous response' },
        }),
        tokenUsage: mockTokenUsage,
      });

      const result = await evaluateResponse(
        mockRedteamProvider,
        'Judge prompt',
        'Target response',
        'Previous response',
        true,
      );

      expect(result).toEqual({
        score: 5,
        explanation: 'Good but penalized',
        tokenUsage: mockTokenUsage,
      });
    });

    it('should handle minimum score correctly', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          currentResponse: { rating: 2, explanation: 'Poor response' },
          previousBestResponse: { rating: 1, explanation: 'Previous response' },
        }),
        tokenUsage: mockTokenUsage,
      });

      const result = await evaluateResponse(
        mockRedteamProvider,
        'Judge prompt',
        'Target response',
        'Previous response',
        true,
      );

      expect(result).toEqual({
        score: 1,
        explanation: 'Poor response',
        tokenUsage: mockTokenUsage,
      });
    });

    it('should handle missing previous response', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          currentResponse: { rating: 7, explanation: 'First response' },
          previousBestResponse: { rating: 0, explanation: '' },
        }),
        tokenUsage: mockTokenUsage,
      });

      const result = await evaluateResponse(
        mockRedteamProvider,
        'Judge prompt',
        'Target response',
        '',
        false,
      );

      expect(result).toEqual({
        score: 7,
        explanation: 'First response',
        tokenUsage: mockTokenUsage,
      });
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
      mockRedteamProvider.callApi.mockResolvedValue({
        output: JSON.stringify(mockResponse),
        tokenUsage: mockTokenUsage,
      });

      const redteamHistory: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'User message' },
      ];

      const result = await getNewPrompt(mockRedteamProvider, redteamHistory);

      expect(result).toEqual({
        ...mockResponse,
        tokenUsage: mockTokenUsage,
      });
    });

    it('should throw an error for invalid API response', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({
        output: 'invalid json',
        tokenUsage: mockTokenUsage,
      });

      const testHistory: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'User message' },
      ];

      await expect(getNewPrompt(mockRedteamProvider, testHistory)).rejects.toThrow(
        'Expected a JSON object',
      );
    });

    it('should handle empty history correctly', async () => {
      const mockResponse = {
        improvement: 'Initial improvement',
        prompt: 'Initial prompt',
      };
      mockRedteamProvider.callApi.mockResolvedValue({
        output: JSON.stringify(mockResponse),
        tokenUsage: mockTokenUsage,
      });

      const result = await getNewPrompt(mockRedteamProvider, []);

      expect(result).toEqual({
        ...mockResponse,
        tokenUsage: mockTokenUsage,
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

  describe('checkIfOnTopic', () => {
    let mockRedteamProvider: jest.Mocked<OpenAiChatCompletionProvider>;

    beforeEach(() => {
      mockRedteamProvider = {
        callApi: jest.fn(),
      } as unknown as jest.Mocked<OpenAiChatCompletionProvider>;
    });

    it('should return true for on-topic prompt', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({ onTopic: true }),
        tokenUsage: mockTokenUsage,
      });

      const result = await checkIfOnTopic(
        mockRedteamProvider,
        'On-topic system prompt',
        'Target prompt',
      );

      expect(result).toEqual({
        isOnTopic: true,
        tokenUsage: mockTokenUsage,
      });
    });

    it('should return false for off-topic prompt', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({ onTopic: false }),
        tokenUsage: mockTokenUsage,
      });

      const result = await checkIfOnTopic(
        mockRedteamProvider,
        'On-topic system prompt',
        'Off-topic prompt',
      );

      expect(result).toEqual({
        isOnTopic: false,
        tokenUsage: mockTokenUsage,
      });
    });

    it('should throw an error for invalid API response', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({
        output: 'invalid json',
        tokenUsage: mockTokenUsage,
      });

      await expect(
        checkIfOnTopic(mockRedteamProvider, 'On-topic system prompt', 'Target prompt'),
      ).rejects.toThrow('Expected a JSON object');
    });

    it('should throw an error for unexpected API response format', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({ unexpectedKey: true }),
        tokenUsage: mockTokenUsage,
      });

      await expect(
        checkIfOnTopic(mockRedteamProvider, 'On-topic system prompt', 'Target prompt'),
      ).rejects.toThrow('Invariant failed: Expected onTopic to be a boolean');
    });
  });

  describe('calculateBranches', () => {
    it('should calculate branches correctly for various scores and depths', () => {
      // Test base case (BASE_BRANCHES = 2)
      expect(calculateBranches(5, 0)).toBe(2); // Base case with no modifiers

      // Test high scores
      expect(calculateBranches(8, 0)).toBe(3); // BASE_BRANCHES(2) + 1 for score >= 6
      expect(calculateBranches(9, 0)).toBe(3); // MAX_BRANCHES is 3
      expect(calculateBranches(6, 0)).toBe(3); // BASE_BRANCHES(2) + 1 for score >= 6
      expect(calculateBranches(7, 0)).toBe(3); // BASE_BRANCHES(2) + 1 for score >= 6

      // Test low scores
      expect(calculateBranches(3, 0)).toBe(1); // BASE_BRANCHES(2) - 1 for score <= 3
      expect(calculateBranches(2, 0)).toBe(1); // MIN_BRANCHES is 1

      // Test depth impact
      expect(calculateBranches(5, 2)).toBe(1); // Reduced by depth/2
      expect(calculateBranches(5, 4)).toBe(1); // MIN_BRANCHES is 1
      expect(calculateBranches(8, 2)).toBe(3); // High score still maintains max branches at depth 2
      expect(calculateBranches(8, 4)).toBe(2); // Updated expectation for depth 4
    });

    it('should never return less than MIN_BRANCHES', () => {
      expect(calculateBranches(1, 10)).toBe(1);
    });

    it('should never return more than MAX_BRANCHES', () => {
      expect(calculateBranches(10, 0)).toBe(3); // MAX_BRANCHES is 3
    });

    it('should decrease branches as depth increases', () => {
      const score = 7;
      const branchesAtDepth0 = calculateBranches(score, 0);
      const branchesAtDepth2 = calculateBranches(score, 2);
      const branchesAtDepth4 = calculateBranches(score, 4);

      expect(branchesAtDepth2).toBeLessThan(branchesAtDepth0);
      expect(branchesAtDepth4).toBeLessThan(branchesAtDepth2);
    });
  });

  describe('calculateSimilarity', () => {
    it('should calculate similarity correctly', () => {
      expect(calculateSimilarity('hello world', 'hello there')).toBeCloseTo(0.33, 2);
      expect(calculateSimilarity('test prompt', 'test prompt')).toBe(1);
      expect(calculateSimilarity('completely different', 'totally unrelated')).toBe(0);
    });

    it('should be case-insensitive', () => {
      expect(calculateSimilarity('Hello World', 'hello world')).toBe(1);
    });

    it('should handle empty strings', () => {
      expect(calculateSimilarity('', '')).toBe(1);
      expect(calculateSimilarity('test', '')).toBe(0);
    });

    it('should handle different word orders', () => {
      expect(calculateSimilarity('world hello', 'hello world')).toBe(1);
    });
  });

  describe('selectDiverseBestNodes', () => {
    it('should select diverse best nodes', () => {
      const nodes: TreeNode[] = [
        { prompt: 'test 1', score: 8, children: [], depth: 0 },
        { prompt: 'test 2', score: 7, children: [], depth: 0 },
        { prompt: 'very different', score: 6, children: [], depth: 0 },
        { prompt: 'test 3', score: 5, children: [], depth: 0 },
      ];

      const result = selectDiverseBestNodes(nodes, 3);

      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({ score: 8 });
      expect(result[1]).toMatchObject({ score: 6, prompt: 'very different' });
      expect(result[2]).toMatchObject({ score: 6 });
    });

    it('should handle cases where there are fewer nodes than requested', () => {
      const nodes: TreeNode[] = [
        { prompt: 'test 1', score: 8, children: [], depth: 0 },
        { prompt: 'test 2', score: 7, children: [], depth: 0 },
      ];

      const result = selectDiverseBestNodes(nodes, 3);

      expect(result).toHaveLength(2);
      expect(result).toEqual([
        expect.objectContaining({ score: 8 }),
        expect.objectContaining({ score: 7 }),
      ]);
    });

    it('should select best remaining nodes if not enough diverse nodes', () => {
      const nodes: TreeNode[] = [
        { prompt: 'test 1', score: 8, children: [], depth: 0 },
        { prompt: 'test 2', score: 7, children: [], depth: 0 },
        { prompt: 'test 3', score: 6, children: [], depth: 0 },
        { prompt: 'test 4', score: 5, children: [], depth: 0 },
      ];

      const result = selectDiverseBestNodes(nodes, 3);

      expect(result).toHaveLength(3);
      expect(result).toEqual([
        expect.objectContaining({ score: 8 }),
        expect.objectContaining({ score: 7 }),
        expect.objectContaining({ score: 6 }),
      ]);
    });

    it('should select diverse best nodes based on similarity threshold', () => {
      const nodes: TreeNode[] = [
        { prompt: 'test prompt one', score: 8, children: [], depth: 0 },
        { prompt: 'test prompt two', score: 7, children: [], depth: 0 },
        { prompt: 'completely different', score: 6, children: [], depth: 0 },
        { prompt: 'test prompt three', score: 5, children: [], depth: 0 },
      ];

      const result = selectDiverseBestNodes(nodes, 3);

      expect(result).toHaveLength(3);
      expect(result[0].score).toBe(8);
      expect(result[1].score).toBe(6);
      expect(result[2].prompt).toBe('completely different');
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

    it('should create history entry with all fields', () => {
      const result = updateRedteamHistory(
        'test response',
        'test goal',
        7,
        true,
        false,
        'test explanation',
      );

      expect(result.role).toBe('user');
      expect(result.content).toMatch(/LANGUAGE MODEL OUTPUT: test response/);
      expect(result.content).toMatch(/OBJECTIVE: test goal/);
      expect(result.content).toMatch(/SCORE: 7/);
      expect(result.content).toMatch(/EXPLANATION: test explanation/);
    });

    it('should include off-topic marker when isOnTopic is false', () => {
      const result = updateRedteamHistory(
        'test response',
        'test goal',
        7,
        false,
        false,
        'test explanation',
      );

      expect(result.content).toContain('(your prompt was off-topic)');
    });

    it('should include penalized phrase marker when containsPenalizedPhrase is true', () => {
      const result = updateRedteamHistory(
        'test response',
        'test goal',
        7,
        true,
        true,
        'test explanation',
      );

      expect(result.content).toContain('(contains penalized phrase)');
    });

    it('should handle missing explanation', () => {
      const result = updateRedteamHistory('test response', 'test goal', 7, true, false);

      expect(result.content).not.toContain('EXPLANATION:');
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
      mockTargetProvider.callApi.mockResolvedValue({
        output: mockResponse,
        tokenUsage: mockTokenUsage,
      });

      const result = await getTargetResponse(
        mockTargetProvider,
        'Test prompt',
        { prompt: { label: 'test', raw: 'Test prompt' }, vars: {} },
        {},
      );

      expect(result).toEqual({
        output: JSON.stringify(mockResponse),
        sessionId: undefined,
        tokenUsage: mockTokenUsage,
      });
    });

    it('should stringify non-string outputs', async () => {
      const nonStringOutput = { key: 'value' };
      mockTargetProvider.callApi.mockResolvedValue({
        output: nonStringOutput,
        tokenUsage: mockTokenUsage,
      });

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
        tokenUsage: mockTokenUsage,
      });
    });
  });
});
