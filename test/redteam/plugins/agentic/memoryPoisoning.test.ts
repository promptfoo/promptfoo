import {
  MemoryPoisoningPluginGrader,
  VarsSchema,
} from '../../../../src/redteam/plugins/agentic/memoryPoisoning';

describe('MemoryPoisoningPluginGrader', () => {
  let grader: MemoryPoisoningPluginGrader;

  beforeEach(() => {
    grader = new MemoryPoisoningPluginGrader();
  });

  describe('renderRubric', () => {
    it('should render rubric with valid vars', () => {
      const vars = {
        purpose: 'Test purpose',
        prompt: 'Test prompt',
        scenario: {
          memory: 'Test memory',
          followUp: 'Test followup',
        },
      };

      const result = grader.renderRubric(vars);

      expect(result).toContain('Test purpose');
      expect(result).toContain('Test memory');
      expect(result).toContain('Test prompt');
      expect(result).toContain('Test followup');
    });

    it('should throw error for invalid vars', () => {
      const invalidVars = {
        purpose: 'Test purpose',
        prompt: 'Test prompt',
        scenario: {
          memory: 'Test memory',
          // Missing followUp
        },
      };

      expect(() => grader.renderRubric(invalidVars as any)).toThrow(
        'Invalid vars passed to MemoryPoisoningPluginGrader',
      );
    });

    it('should validate vars with VarsSchema', () => {
      const validVars = {
        purpose: 'Test purpose',
        prompt: 'Test prompt',
        scenario: {
          memory: 'Test memory',
          followUp: 'Test followup',
        },
      };

      const parseResult = VarsSchema.safeParse(validVars);
      expect(parseResult.success).toBe(true);
    });

    it('should include output format instructions in rubric', () => {
      const vars = {
        purpose: 'Test purpose',
        prompt: 'Test prompt',
        scenario: {
          memory: 'Test memory',
          followUp: 'Test followup',
        },
      };

      const result = grader.renderRubric(vars);

      expect(result).toContain('"reason":');
      expect(result).toContain('"score":');
      expect(result).toContain('"pass":');
    });

    it('should have correct plugin ID', () => {
      expect(grader.id).toBe('promptfoo:redteam:agentic:memory-poisoning');
    });

    it('should initialize with empty rubric', () => {
      expect(grader.rubric).toBe('');
    });

    it('should validate all required fields', () => {
      const invalidVars = [
        {}, // Empty object
        { purpose: 'Test' }, // Missing prompt and scenario
        { purpose: 'Test', prompt: 'Test' }, // Missing scenario
        {
          purpose: 'Test',
          prompt: 'Test',
          scenario: {}, // Empty scenario
        },
        {
          purpose: 'Test',
          prompt: 'Test',
          scenario: {
            memory: 'Test', // Missing followUp
          },
        },
        {
          purpose: 'Test',
          prompt: 'Test',
          scenario: {
            followUp: 'Test', // Missing memory
          },
        },
      ];

      invalidVars.forEach((vars) => {
        expect(() => grader.renderRubric(vars as any)).toThrow(
          'Invalid vars passed to MemoryPoisoningPluginGrader',
        );
      });
    });

    it('should handle empty strings in required fields', () => {
      const vars = {
        purpose: '',
        prompt: '',
        scenario: {
          memory: '',
          followUp: '',
        },
      };

      const result = grader.renderRubric(vars);
      expect(result).toContain('purpose');
      expect(result).toContain('memory');
    });
  });
});
