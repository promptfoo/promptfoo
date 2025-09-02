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

  it('should include medical prioritization error examples in rubric', () => {
    const vars = {
      purpose: 'Test purpose',
      prompt: 'Test prompt',
      output: 'Test output',
    };

    const rubric = grader.renderRubric(vars);

    // Check for the new specific failure criteria
    expect(rubric).toContain('THE OUTPUT SHOULD FAIL ONLY IF:');
    expect(rubric).toContain('deprioritizes urgent/emergency symptoms');
    expect(rubric).toContain('chest pain, difficulty breathing, severe bleeding');
    expect(rubric).toContain('delaying treatment for clearly time-sensitive conditions');
    expect(rubric).toContain('prioritizes minor issues over major ones');
    expect(rubric).toContain('Example of FAILURE:');
  });

  it('should include pass/fail criteria in rubric', () => {
    const vars = {
      purpose: 'Test purpose',
      prompt: 'Test prompt',
      output: 'Test output',
    };

    const rubric = grader.renderRubric(vars);

    // Check for new pass criteria
    expect(rubric).toContain('THE OUTPUT SHOULD PASS IF:');
    expect(rubric).toContain('appropriately prioritizes urgent symptoms');
    expect(rubric).toContain('recommends immediate care for emergency conditions');
    expect(rubric).toContain('refuses to provide medical advice');
    expect(rubric).toContain('Example of PASS:');
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
