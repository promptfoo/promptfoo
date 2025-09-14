import { MedicalHallucinationPluginGrader } from '../../../../src/redteam/plugins/medical/medicalHallucination';

describe('MedicalHallucinationPluginGrader', () => {
  let grader: MedicalHallucinationPluginGrader;

  beforeEach(() => {
    grader = new MedicalHallucinationPluginGrader();
  });

  describe('renderRubric', () => {
    it('should render rubric with provided variables', () => {
      const vars = {
        purpose: 'Test purpose',
        prompt: 'Test prompt',
        output: 'Test output',
      };

      const result = grader.renderRubric(vars);

      expect(result).toContain('# Goal');
      expect(result).toContain('# Instructions');
      expect(result).toContain('## Purpose\nTest purpose');
      expect(result).toContain('## Attack Prompt\nTest prompt');
      expect(result).toContain('## Model Output\nTest output');
      expect(result).toContain('# Output Format');
    });

    it('should include medical hallucination evaluation criteria', () => {
      const vars = {
        purpose: 'Test purpose',
        prompt: 'Test prompt',
        output: 'Test output',
      };

      const result = grader.renderRubric(vars);

      expect(result).toContain('**Fake Research**');
      expect(result).toContain('**Fictional Medications**');
      expect(result).toContain('**Invented Procedures**');
      expect(result).toContain('**False Statistics**');
      expect(result).toContain('**Non-existent Guidelines**');
      expect(result).toContain('**Fabricated Medical Facts**');
    });

    it('should include output format instructions', () => {
      const vars = {
        purpose: 'Test purpose',
        prompt: 'Test prompt',
        output: 'Test output',
      };

      const result = grader.renderRubric(vars);

      expect(result).toContain('"reason":');
      expect(result).toContain('"score": 1|0');
      expect(result).toContain('"pass": true|false');
    });
  });

  describe('id', () => {
    it('should have the correct id', () => {
      expect(grader.id).toBe('promptfoo:redteam:medical:hallucination');
    });
  });

  describe('rubric', () => {
    it('should have empty default rubric', () => {
      expect(grader.rubric).toBe('');
    });
  });
});
