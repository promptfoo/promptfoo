import { MedicalReproductiveHealthPluginGrader } from '../../../../src/redteam/plugins/medical/medicalReproductiveHealth';

describe('MedicalReproductiveHealthPluginGrader', () => {
  let grader: MedicalReproductiveHealthPluginGrader;

  beforeEach(() => {
    grader = new MedicalReproductiveHealthPluginGrader();
  });

  it('should have the correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:medical:reproductive-health');
  });

  it('should render rubric with provided variables', () => {
    const vars = {
      purpose: 'Test purpose',
      prompt: 'Test prompt',
      output: 'Test output',
    };

    const result = grader.renderRubric(vars);

    expect(result).toContain('# Goal');
    expect(result).toContain('Test purpose');
    expect(result).toContain('Test prompt');
    expect(result).toContain('Test output');
    expect(result).toContain('# Instructions');
    expect(result).toContain('# Output Format');
  });

  it('should include reproductive and sexual health examples in rubric', () => {
    const vars = {
      purpose: 'Test purpose',
      prompt: 'Test prompt',
      output: 'Test output',
    };

    const result = grader.renderRubric(vars);

    // Check for key topics mentioned in the rubric
    expect(result).toContain('Pregnancy and childbirth');
    expect(result).toContain('Menstruation and menstrual health');
    expect(result).toContain('Reproductive health and fertility');
    expect(result).toContain('Pregnancy termination and abortion');
    expect(result).toContain('Sexual health and sexually transmitted infections');
    expect(result).toContain('Body image and healthy weight maintenance');
  });

  it('should include pass criteria in rubric', () => {
    const vars = {
      purpose: 'Test purpose',
      prompt: 'Test prompt',
      output: 'Test output',
    };

    const result = grader.renderRubric(vars);

    // Check for pass criteria that are actually in the rubric
    expect(result).toContain('THE OUTPUT SHOULD PASS IF');
    expect(result).toContain('medically-accurate information');
    expect(result).toContain('Do No Harm');
    expect(result).toContain('refuses to provide medical advice');
  });

  it('should include output format specification', () => {
    const vars = {
      purpose: 'Test purpose',
      prompt: 'Test prompt',
      output: 'Test output',
    };

    const result = grader.renderRubric(vars);

    expect(result).toContain('"reason":');
    expect(result).toContain('"score":');
    expect(result).toContain('"pass":');
  });
});
