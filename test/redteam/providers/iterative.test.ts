import { jest } from '@jest/globals';
import {
  renderSystemPrompts,
  calculateBranches,
  calculateSimilarity,
  selectDiverseBestNodes,
} from '../../../src/redteam/providers/iterative';
import {
  ATTACKER_SYSTEM_PROMPT,
  JUDGE_SYSTEM_PROMPT,
  ON_TOPIC_SYSTEM_PROMPT,
} from '../../../src/redteam/providers/prompts';
import { getNunjucksEngine } from '../../../src/util/templates';

// Mock dependencies
jest.mock('../../../src/providers/openai');
jest.mock('../../../src/util/templates');

describe('RedteamIterativeProvider', () => {
  describe('renderSystemPrompts', () => {
    it('should render system prompts correctly', () => {
      const mockNunjucks = {
        renderString: jest.fn((template) => template),
      };
      (jest.mocked(getNunjucksEngine)).mockReturnValue(mockNunjucks);

      const goal = 'Test goal';
      const result = renderSystemPrompts(mockNunjucks as any, goal);

      expect(result.redteamSystemPrompt).toBe(ATTACKER_SYSTEM_PROMPT);
      expect(result.onTopicSystemPrompt).toBe(ON_TOPIC_SYSTEM_PROMPT);
      expect(result.judgeSystemPrompt).toBe(JUDGE_SYSTEM_PROMPT);
      expect(mockNunjucks.renderString).toHaveBeenCalledTimes(3);
    });
  });

  // Add more tests for other functions...

  describe('calculateBranches', () => {
    it('should calculate branches correctly', () => {
      expect(calculateBranches(8, 0)).toBe(5);
      expect(calculateBranches(6, 1)).toBe(4);
      expect(calculateBranches(3, 2)).toBe(2);
      expect(calculateBranches(1, 4)).toBe(1);
    });
  });

  describe('calculateSimilarity', () => {
    it('should calculate similarity correctly', () => {
      expect(calculateSimilarity('hello world', 'hello there')).toBeCloseTo(0.33, 2);
      expect(calculateSimilarity('test prompt', 'test prompt')).toBe(1);
      expect(calculateSimilarity('completely different', 'totally unrelated')).toBe(0);
    });
  });

  describe('selectDiverseBestNodes', () => {
    it('should select diverse best nodes', () => {
      const nodes = [
        { prompt: 'test 1', score: 8, children: [], depth: 0 },
        { prompt: 'test 2', score: 7, children: [], depth: 0 },
        { prompt: 'very different', score: 6, children: [], depth: 0 },
        { prompt: 'test 3', score: 5, children: [], depth: 0 },
      ];

      const result = selectDiverseBestNodes(nodes, 3);

      expect(result).toHaveLength(3);
      expect(result[0].score).toBe(8);
      expect(result[1].score).toBe(7);
      expect(result[2].prompt).toBe('very different');
    });
  });
});
