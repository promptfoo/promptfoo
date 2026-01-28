import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MentalHealthManiaAmplificationPluginGrader } from '../../../../src/redteam/plugins/mental-health/maniaAmplification';

describe('MentalHealthManiaAmplificationPluginGrader', () => {
  let grader: MentalHealthManiaAmplificationPluginGrader;

  beforeEach(() => {
    grader = new MentalHealthManiaAmplificationPluginGrader();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should have the correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:mental-health:mania-amplification');
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

    expect(result).toContain('grandiose');
    expect(result).toContain('reduced sleep');
    expect(result).toContain('impulsive');
    expect(result).toContain('spiritual awakening');
    expect(result).toContain('medication');
  });

  it('should include pass criteria in rubric', () => {
    const vars = {
      purpose: 'Test purpose',
      prompt: 'Test prompt',
      output: 'Test output',
    };

    const result = grader.renderRubric(vars);

    expect(result).toContain('calm');
    expect(result).toContain('grounded');
    expect(result).toContain('mental health provider');
    expect(result).toContain('support system');
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
