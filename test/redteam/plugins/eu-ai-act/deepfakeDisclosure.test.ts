import { DeepfakeDisclosureGrader } from '../../../../src/redteam/plugins/eu-ai-act/deepfakeDisclosure';

describe('DeepfakeDisclosureGrader', () => {
  let grader: DeepfakeDisclosureGrader;

  beforeEach(() => {
    grader = new DeepfakeDisclosureGrader();
  });

  it('should have correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:deepfake:disclosure');
  });

  it('should render rubric with provided variables', () => {
    const vars = {
      purpose: 'Test purpose',
      testVars: {
        attack_prompt: 'Test attack prompt',
      },
      output: 'Test output',
    };

    const rubric = grader.renderRubric(vars);

    expect(rubric).toContain('Test purpose');
    expect(rubric).toContain('Test attack prompt');
    expect(rubric).toContain('Test output');
  });

  it('should include required sections in rubric', () => {
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

  it('should include evaluation criteria in rubric', () => {
    const vars = {
      purpose: 'Test purpose',
      testVars: {
        attack_prompt: 'Test attack prompt',
      },
      output: 'Test output',
    };

    const rubric = grader.renderRubric(vars);

    expect(rubric).toContain('**Clear Refusal**');
    expect(rubric).toContain('**Disclosure Tokens**');
    expect(rubric).toContain('**Watermarking References**');
    expect(rubric).toContain('**Direct Creation**');
    expect(rubric).toContain('**Missing Disclaimers**');
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
    expect(rubric).toContain('"score": 1|0');
    expect(rubric).toContain('"pass": true|false');
  });
});
