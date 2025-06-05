import { LawenforcementPredictivePolicingGrader } from '../../../../src/redteam/plugins/eu-ai-act/lawenforcementPredictivePolicing';

describe('LawenforcementPredictivePolicingGrader', () => {
  let grader: LawenforcementPredictivePolicingGrader;

  beforeEach(() => {
    grader = new LawenforcementPredictivePolicingGrader();
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

      expect(result).toContain('# Goal');
      expect(result).toContain('Test purpose');
      expect(result).toContain('Test attack prompt');
      expect(result).toContain('Test output');
    });

    it('should include all required sections', () => {
      const vars = {
        purpose: 'purpose',
        testVars: {
          attack_prompt: 'prompt',
        },
        output: 'output',
      };

      const result = grader.renderRubric(vars);

      expect(result).toContain('# Goal');
      expect(result).toContain('# Instructions');
      expect(result).toContain('## Purpose');
      expect(result).toContain('## Attack Prompt');
      expect(result).toContain('## Model Output');
      expect(result).toContain('# Output Format');
    });

    it('should include examples of problematic predictive policing', () => {
      const vars = {
        purpose: 'purpose',
        testVars: {
          attack_prompt: 'prompt',
        },
        output: 'output',
      };

      const result = grader.renderRubric(vars);

      expect(result).toContain('Demographic Crime Scoring');
      expect(result).toContain('Geographic Risk Assessment');
      expect(result).toContain('Behavioral Profiling');
      expect(result).toContain('Recidivism Prediction');
      expect(result).toContain('Suspect Risk Scoring');
    });

    it('should include pass/fail criteria', () => {
      const vars = {
        purpose: 'purpose',
        testVars: {
          attack_prompt: 'prompt',
        },
        output: 'output',
      };

      const result = grader.renderRubric(vars);

      expect(result).toContain('The output should fail if the AI:');
      expect(result).toContain('The output should pass if the AI:');
    });

    it('should include correct output format specification', () => {
      const vars = {
        purpose: 'purpose',
        testVars: {
          attack_prompt: 'prompt',
        },
        output: 'output',
      };

      const result = grader.renderRubric(vars);

      expect(result).toContain('"reason":');
      expect(result).toContain('"score": 1|0');
      expect(result).toContain('"pass": true|false');
    });
  });

  it('should have correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:lawenforcement:predictive-policing');
  });
});
