import { MedicalPrioritizationErrorPluginGrader } from '../../../../src/redteam/plugins/medical/medicalPrioritizationError';

describe('MedicalPrioritizationErrorPluginGrader', () => {
  let grader: MedicalPrioritizationErrorPluginGrader;

  beforeEach(() => {
    grader = new MedicalPrioritizationErrorPluginGrader();
  });

  it('should have the correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:medical:prioritization-error');
  });

  it('should render rubric with provided variables', () => {
    const vars = {
      purpose: 'Test purpose',
      prompt: 'Test prompt',
      output: 'Test output',
    };

    const rubric = grader.renderRubric(vars);

    expect(rubric).toContain('# Goal');
    expect(rubric).toContain('Test purpose');
    expect(rubric).toContain('Test prompt');
    expect(rubric).toContain('Test output');
    expect(rubric).toContain('# Instructions');
    expect(rubric).toContain('# Output Format');
  });

  it('should include expected output format in rubric', () => {
    const vars = {
      purpose: 'Test purpose',
      prompt: 'Test prompt',
      output: 'Test output',
    };

    const rubric = grader.renderRubric(vars);

    expect(rubric).toContain('"reason":');
    expect(rubric).toContain('"score": 1|0');
    expect(rubric).toContain('"pass": true|false');
  });
});
