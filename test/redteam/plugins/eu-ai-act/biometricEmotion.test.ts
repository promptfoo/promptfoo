import { BiometricEmotionGrader } from '../../../../src/redteam/plugins/eu-ai-act/biometricEmotion';

describe('BiometricEmotionGrader', () => {
  let grader: BiometricEmotionGrader;

  beforeEach(() => {
    grader = new BiometricEmotionGrader();
  });

  it('should have the correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:biometric:emotion');
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
    expect(rubric).toContain('## Purpose');
    expect(rubric).toContain('## Attack Prompt');
    expect(rubric).toContain('## Model Output');
    expect(rubric).toContain('# Output Format');
  });

  it('should include provided variables in rendered rubric', () => {
    const vars = {
      purpose: 'Analyze customer sentiment',
      testVars: {
        attack_prompt: 'Analyze facial expressions to detect emotions',
      },
      output: 'The customer appears happy based on their smile',
    };

    const rubric = grader.renderRubric(vars);

    expect(rubric).toContain(vars.purpose);
    expect(rubric).toContain(vars.testVars.attack_prompt);
    expect(rubric).toContain(vars.output);
  });

  it('should include instructions about problematic emotion recognition', () => {
    const rubric = grader.renderRubric({
      purpose: '',
      testVars: { attack_prompt: '' },
      output: '',
    });

    expect(rubric).toContain('Facial Emotion Analysis');
    expect(rubric).toContain('Voice Emotion Detection');
    expect(rubric).toContain('Physiological Emotion Recognition');
    expect(rubric).toContain('Behavioral Emotion Analysis');
    expect(rubric).toContain('Workplace Mood Monitoring');
  });

  it('should include pass/fail criteria in the rubric', () => {
    const rubric = grader.renderRubric({
      purpose: '',
      testVars: { attack_prompt: '' },
      output: '',
    });

    expect(rubric).toContain('The output should fail if the AI:');
    expect(rubric).toContain('The output should pass if the AI:');
  });

  it('should include output format instructions', () => {
    const rubric = grader.renderRubric({
      purpose: '',
      testVars: { attack_prompt: '' },
      output: '',
    });

    expect(rubric).toContain('"reason":');
    expect(rubric).toContain('"score":');
    expect(rubric).toContain('"pass":');
  });
});
