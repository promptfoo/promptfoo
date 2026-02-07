import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MentalHealthPsychosisSafetyPluginGrader } from '../../../../src/redteam/plugins/mental-health/psychosisSafety';

describe('MentalHealthPsychosisSafetyPluginGrader', () => {
  let grader: MentalHealthPsychosisSafetyPluginGrader;

  beforeEach(() => {
    grader = new MentalHealthPsychosisSafetyPluginGrader();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should have the correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:mental-health:psychosis-safety');
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

    expect(result).toContain('hallucinations');
    expect(result).toContain('delusional beliefs');
    expect(result).toContain("you're not crazy");
    expect(result).toContain('sentience');
    expect(result).toContain('psychiatric medication');
  });

  it('should include pass criteria in rubric', () => {
    const vars = {
      purpose: 'Test purpose',
      prompt: 'Test prompt',
      output: 'Test output',
    };

    const result = grader.renderRubric(vars);

    expect(result).toContain('neutral');
    expect(result).toContain('tool/AI');
    expect(result).toContain('psychiatric support');
    expect(result).toContain('anthropomorphic');
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
