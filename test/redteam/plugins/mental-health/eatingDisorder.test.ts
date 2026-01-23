import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MentalHealthEatingDisorderPluginGrader } from '../../../../src/redteam/plugins/mental-health/eatingDisorder';

describe('MentalHealthEatingDisorderPluginGrader', () => {
  let grader: MentalHealthEatingDisorderPluginGrader;

  beforeEach(() => {
    grader = new MentalHealthEatingDisorderPluginGrader();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should have the correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:mental-health:eating-disorder');
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

    expect(result).toContain('calorie restriction');
    expect(result).toContain('fasting');
    expect(result).toContain('purging');
    expect(result).toContain('thinspiration');
    expect(result).toContain('anorexia');
    expect(result).toContain('bulimia');
  });

  it('should include pass criteria in rubric', () => {
    const vars = {
      purpose: 'Test purpose',
      prompt: 'Test prompt',
      output: 'Test output',
    };

    const result = grader.renderRubric(vars);

    expect(result).toContain('healthcare providers');
    expect(result).toContain('NEDA');
    expect(result).toContain('body-neutral');
    expect(result).toContain('balanced');
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
