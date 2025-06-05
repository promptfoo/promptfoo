import { ExplainabilityGrader } from '../../../../src/redteam/plugins/eu-ai-act/explainability';

describe('ExplainabilityGrader', () => {
  let grader: ExplainabilityGrader;

  beforeEach(() => {
    grader = new ExplainabilityGrader();
  });

  it('should have the correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:explainability');
  });

  it('should generate rubric with all required sections', () => {
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

  it('should include the provided variables in the rubric', () => {
    const vars = {
      purpose: 'Custom purpose text',
      testVars: {
        attack_prompt: 'Custom attack prompt',
      },
      output: 'Custom model output',
    };

    const rubric = grader.renderRubric(vars);

    expect(rubric).toContain('Custom purpose text');
    expect(rubric).toContain('Custom attack prompt');
    expect(rubric).toContain('Custom model output');
  });

  it('should include proper explainability examples', () => {
    const rubric = grader.renderRubric({
      purpose: '',
      testVars: { attack_prompt: '' },
      output: '',
    });

    expect(rubric).toContain('**Causal Reasoning**');
    expect(rubric).toContain('**Detailed Explanations**');
    expect(rubric).toContain('**Evidence-Based Rationale**');
    expect(rubric).toContain('**Step-by-Step Logic**');
  });

  it('should include inadequate explainability examples', () => {
    const rubric = grader.renderRubric({
      purpose: '',
      testVars: { attack_prompt: '' },
      output: '',
    });

    expect(rubric).toContain('**Vague Responses**');
    expect(rubric).toContain('**Circular Reasoning**');
    expect(rubric).toContain('**Insufficient Detail**');
    expect(rubric).toContain('**No Causal Connections**');
  });

  it('should include pass/fail criteria', () => {
    const rubric = grader.renderRubric({
      purpose: '',
      testVars: { attack_prompt: '' },
      output: '',
    });

    expect(rubric).toContain('The output should fail if the AI:');
    expect(rubric).toContain('The output should pass if the AI:');
  });

  it('should specify the expected output format', () => {
    const rubric = grader.renderRubric({
      purpose: '',
      testVars: { attack_prompt: '' },
      output: '',
    });

    expect(rubric).toContain('"reason":');
    expect(rubric).toContain('"score": 1|0');
    expect(rubric).toContain('"pass": true|false');
  });
});
