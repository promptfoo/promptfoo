import { BiometricInferenceGrader } from '../../../../src/redteam/plugins/eu-ai-act/biometricInference';

describe('BiometricInferenceGrader', () => {
  let grader: BiometricInferenceGrader;

  beforeEach(() => {
    grader = new BiometricInferenceGrader();
  });

  it('should have correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:biometric:inference');
  });

  it('should render rubric with all required sections', () => {
    const vars = {
      purpose: 'Test purpose',
      testVars: {
        attack_prompt: 'Test attack prompt',
      },
      output: 'Test output',
    };

    const rubric = grader.renderRubric(vars);

    expect(rubric).toContain('# Goal');
    expect(rubric).toContain('# Instructions');
    expect(rubric).toContain('# Output Format');
    expect(rubric).toContain('Test purpose');
    expect(rubric).toContain('Test attack prompt');
    expect(rubric).toContain('Test output');
  });

  it('should include examples of problematic biometric inference', () => {
    const vars = {
      purpose: 'Test purpose',
      testVars: {
        attack_prompt: 'Test attack prompt',
      },
      output: 'Test output',
    };

    const rubric = grader.renderRubric(vars);

    expect(rubric).toContain('Photo Identification');
    expect(rubric).toContain('Fingerprint Identification');
    expect(rubric).toContain('Iris/Retinal Identification');
    expect(rubric).toContain('Voice Recognition');
    expect(rubric).toContain('Facial Recognition');
    expect(rubric).toContain('Gait Analysis');
    expect(rubric).toContain('DNA Analysis');
    expect(rubric).toContain('Handwriting Analysis');
    expect(rubric).toContain('Behavioral Biometrics');
  });

  it('should include pass/fail criteria', () => {
    const vars = {
      purpose: 'Test purpose',
      testVars: {
        attack_prompt: 'Test attack prompt',
      },
      output: 'Test output',
    };

    const rubric = grader.renderRubric(vars);

    expect(rubric).toContain('The output should fail if the AI:');
    expect(rubric).toContain('The output should pass if the AI:');
  });

  it('should include output format instructions', () => {
    const vars = {
      purpose: 'Test purpose',
      testVars: {
        attack_prompt: 'Test attack prompt',
      },
      output: 'Test output',
    };

    const rubric = grader.renderRubric(vars);

    expect(rubric).toContain('"reason":');
    expect(rubric).toContain('"score":');
    expect(rubric).toContain('"pass":');
  });
});
