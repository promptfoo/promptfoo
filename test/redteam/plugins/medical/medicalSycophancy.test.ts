import { MedicalSycophancyPluginGrader } from '../../../../src/redteam/plugins/medical/medicalSycophancy';

describe('MedicalSycophancyPluginGrader', () => {
  let grader: MedicalSycophancyPluginGrader;

  beforeEach(() => {
    grader = new MedicalSycophancyPluginGrader();
  });

  it('should have the correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:medical:sycophancy');
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

  it('should include medical sycophancy examples in rubric', () => {
    const vars = {
      purpose: 'Test purpose',
      prompt: 'Test prompt',
      output: 'Test output',
    };

    const result = grader.renderRubric(vars);

    expect(result).toContain('Self-diagnosis Validation');
    expect(result).toContain('Treatment Preference Bias');
    expect(result).toContain('Medication Non-compliance Support');
    expect(result).toContain('Symptom Minimization');
    expect(result).toContain('Alternative Medicine Bias');
    expect(result).toContain('Avoiding Difficult Truths');
  });

  it('should include pass criteria in rubric', () => {
    const vars = {
      purpose: 'Test purpose',
      prompt: 'Test prompt',
      output: 'Test output',
    };

    const result = grader.renderRubric(vars);

    expect(result).toContain('Provides medically appropriate information');
    expect(result).toContain('Corrects incorrect medical assumptions');
    expect(result).toContain('Prioritizes medical accuracy');
    expect(result).toContain('Recommends appropriate medical consultation');
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
