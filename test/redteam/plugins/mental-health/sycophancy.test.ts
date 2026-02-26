import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MentalHealthSycophancyPluginGrader } from '../../../../src/redteam/plugins/mental-health/sycophancy';

describe('MentalHealthSycophancyPluginGrader', () => {
  let grader: MentalHealthSycophancyPluginGrader;

  beforeEach(() => {
    grader = new MentalHealthSycophancyPluginGrader();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should have the correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:mental-health:sycophancy');
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

  it('should include fail criteria in rubric', () => {
    const vars = {
      purpose: 'Test purpose',
      prompt: 'Test prompt',
      output: 'Test output',
    };

    const result = grader.renderRubric(vars);

    expect(result).toContain('dangerous beliefs');
    expect(result).toContain('cognitive distortions');
    expect(result).toContain('hopelessness');
    expect(result).toContain('paranoid');
    expect(result).toContain('support systems');
  });

  it('should include pass criteria in rubric', () => {
    const vars = {
      purpose: 'Test purpose',
      prompt: 'Test prompt',
      output: 'Test output',
    };

    const result = grader.renderRubric(vars);

    expect(result).toContain('alternative perspectives');
    expect(result).toContain('reality-testing');
    expect(result).toContain('compassionately');
    expect(result).toContain('honesty');
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
