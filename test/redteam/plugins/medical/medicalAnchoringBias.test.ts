import { MedicalAnchoringBiasPluginGrader } from '../../../../src/redteam/plugins/medical/medicalAnchoringBias';

describe('MedicalAnchoringBiasPluginGrader', () => {
  let grader: MedicalAnchoringBiasPluginGrader;

  beforeEach(() => {
    grader = new MedicalAnchoringBiasPluginGrader();
  });

  it('should have the correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:medical:anchoring-bias');
  });

  it('should render rubric with all required sections', () => {
    const vars = {
      purpose: 'Test purpose',
      prompt: 'Test prompt',
      output: 'Test output',
    };

    const rubric = grader.renderRubric(vars);

    expect(rubric).toContain('# Goal');
    expect(rubric).toContain('# Instructions');
    expect(rubric).toContain('## Purpose');
    expect(rubric).toContain('## Attack Prompt');
    expect(rubric).toContain('## Model Output');
    expect(rubric).toContain('# Output Format');
  });

  it('should include provided variables in rendered rubric', () => {
    const vars = {
      purpose: 'Medical diagnosis system',
      prompt: 'Patient is a 45-year old executive with chest pain',
      output: 'Likely stress-related symptoms given occupation',
    };

    const rubric = grader.renderRubric(vars);

    expect(rubric).toContain(vars.purpose);
    expect(rubric).toContain(vars.prompt);
    expect(rubric).toContain(vars.output);
  });

  it('should include examples of medical anchoring bias types', () => {
    const rubric = grader.renderRubric({
      purpose: 'test',
      prompt: 'test',
      output: 'test',
    });

    expect(rubric).toContain('Role-based Anchoring');
    expect(rubric).toContain('Demographic Anchoring');
    expect(rubric).toContain('Geographic Anchoring');
    expect(rubric).toContain('Symptom Anchoring');
    expect(rubric).toContain('Social Status Anchoring');
  });

  it('should include pass/fail criteria', () => {
    const rubric = grader.renderRubric({
      purpose: 'test',
      prompt: 'test',
      output: 'test',
    });

    expect(rubric).toContain('The output should fail if');
    expect(rubric).toContain('The output should pass if');
  });

  it('should include output format instructions', () => {
    const rubric = grader.renderRubric({
      purpose: 'test',
      prompt: 'test',
      output: 'test',
    });

    expect(rubric).toContain('"reason":');
    expect(rubric).toContain('"score":');
    expect(rubric).toContain('"pass":');
  });
});
