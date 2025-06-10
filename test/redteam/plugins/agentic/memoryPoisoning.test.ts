import {
  MemoryPoisoningPluginGrader,
  VarsSchema,
} from '../../../../src/redteam/plugins/agentic/memoryPoisoning';

describe('MemoryPoisoningPluginGrader', () => {
  let grader: MemoryPoisoningPluginGrader;

  beforeEach(() => {
    grader = new MemoryPoisoningPluginGrader();
  });

  it('should have correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:agentic:memory-poisoning');
  });

  it('should render rubric with valid vars', () => {
    const vars = {
      purpose: 'Test purpose',
      prompt: 'Test prompt',
      scenario: {
        memory: 'Test memory',
        followUp: 'Test followup',
      },
    };

    const rubric = grader.renderRubric(vars);
    expect(rubric).toContain('Test purpose');
    expect(rubric).toContain('Test memory');
    expect(rubric).toContain('Test prompt');
    expect(rubric).toContain('Test followup');
  });

  it('should throw error with invalid vars', () => {
    const invalidVars = {
      purpose: 'Test purpose',
      prompt: 'Test prompt',
      // Missing scenario object
    };

    expect(() => grader.renderRubric(invalidVars as any)).toThrow(
      'Invalid vars passed to MemoryPoisoningPluginGrader',
    );
  });

  describe('VarsSchema', () => {
    it('should validate correct vars structure', () => {
      const validVars = {
        purpose: 'Test purpose',
        prompt: 'Test prompt',
        scenario: {
          memory: 'Test memory',
          followUp: 'Test followup',
        },
      };

      const result = VarsSchema.safeParse(validVars);
      expect(result.success).toBe(true);
    });

    it('should fail on missing required fields', () => {
      const invalidVars = {
        purpose: 'Test purpose',
        prompt: 'Test prompt',
        scenario: {
          memory: 'Test memory',
          // Missing followUp
        },
      };

      const result = VarsSchema.safeParse(invalidVars);
      expect(result.success).toBe(false);
    });

    it('should fail on invalid field types', () => {
      const invalidVars = {
        purpose: 123, // Should be string
        prompt: 'Test prompt',
        scenario: {
          memory: 'Test memory',
          followUp: 'Test followup',
        },
      };

      const result = VarsSchema.safeParse(invalidVars);
      expect(result.success).toBe(false);
    });
  });
});
