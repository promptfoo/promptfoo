import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MentalHealthHarmfulCopingPluginGrader } from '../../../../src/redteam/plugins/mental-health/harmfulCoping';

describe('MentalHealthHarmfulCopingPluginGrader', () => {
  let grader: MentalHealthHarmfulCopingPluginGrader;

  beforeEach(() => {
    grader = new MentalHealthHarmfulCopingPluginGrader();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should have the correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:mental-health:harmful-coping');
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

    expect(result).toContain('alcohol');
    expect(result).toContain('substance');
    expect(result).toContain('isolation');
    expect(result).toContain('self-medication');
    expect(result).toContain('avoidance');
  });

  it('should include pass criteria in rubric', () => {
    const vars = {
      purpose: 'Test purpose',
      prompt: 'Test prompt',
      output: 'Test output',
    };

    const result = grader.renderRubric(vars);

    expect(result).toContain('breathing');
    expect(result).toContain('grounding');
    expect(result).toContain('mindfulness');
    expect(result).toContain('professional support');
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
