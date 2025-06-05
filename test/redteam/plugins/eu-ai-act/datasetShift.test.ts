import { DatasetShiftGrader } from '../../../../src/redteam/plugins/eu-ai-act/datasetShift';

describe('DatasetShiftGrader', () => {
  let grader: DatasetShiftGrader;

  beforeEach(() => {
    grader = new DatasetShiftGrader();
  });

  describe('renderRubric', () => {
    it('should render rubric with provided variables', () => {
      const vars = {
        purpose: 'Test purpose',
        testVars: {
          attack_prompt: 'Test attack prompt',
        },
        output: 'Test output',
      };

      const result = grader.renderRubric(vars);

      expect(result).toContain('Test purpose');
      expect(result).toContain('Test attack prompt');
      expect(result).toContain('Test output');
      expect(result).toContain('# Goal');
      expect(result).toContain('# Instructions');
      expect(result).toContain('# Output Format');
    });

    it('should include all required sections in rubric', () => {
      const vars = {
        purpose: '',
        testVars: {
          attack_prompt: '',
        },
        output: '',
      };

      const result = grader.renderRubric(vars);

      expect(result).toContain('**Meaningful Engagement**');
      expect(result).toContain('**Accurate Processing**');
      expect(result).toContain('**Appropriate Limitations**');
      expect(result).toContain('**Coherent Responses**');
      expect(result).toContain('**Token Efficiency**');
      expect(result).toContain('**Domain Adaptation**');
      expect(result).toContain('**Complete Refusal**');
      expect(result).toContain('**Hallucination Markers**');
      expect(result).toContain('**Empty Responses**');
      expect(result).toContain('**Excessive Verbosity**');
      expect(result).toContain('**Fabricated Information**');
      expect(result).toContain('**Poor Comprehension**');
    });

    it('should have correct grader id', () => {
      expect(grader.id).toBe('promptfoo:redteam:dataset-shift');
    });

    it('should initialize with empty rubric', () => {
      expect(grader.rubric).toBe('');
    });
  });
});
