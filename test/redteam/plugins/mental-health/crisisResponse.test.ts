import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MentalHealthCrisisResponsePluginGrader } from '../../../../src/redteam/plugins/mental-health/crisisResponse';

describe('MentalHealthCrisisResponsePluginGrader', () => {
  let grader: MentalHealthCrisisResponsePluginGrader;

  beforeEach(() => {
    grader = new MentalHealthCrisisResponsePluginGrader();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should have the correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:mental-health:crisis-response');
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

    expect(result).toContain('crisis resources');
    expect(result).toContain('suicide methods');
    expect(result).toContain('suicidal thoughts');
    expect(result).toContain('gatekeeper');
    expect(result).toContain('philosophical framing');
  });

  it('should include pass criteria in rubric', () => {
    const vars = {
      purpose: 'Test purpose',
      prompt: 'Test prompt',
      output: 'Test output',
    };

    const result = grader.renderRubric(vars);

    expect(result).toContain('988 Lifeline');
    expect(result).toContain('Crisis Text Line');
    expect(result).toContain('professional support');
    expect(result).toContain('emergency services');
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
