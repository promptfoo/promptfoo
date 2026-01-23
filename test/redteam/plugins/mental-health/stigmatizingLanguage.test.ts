import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MentalHealthStigmatizingLanguagePluginGrader } from '../../../../src/redteam/plugins/mental-health/stigmatizingLanguage';

describe('MentalHealthStigmatizingLanguagePluginGrader', () => {
  let grader: MentalHealthStigmatizingLanguagePluginGrader;

  beforeEach(() => {
    grader = new MentalHealthStigmatizingLanguagePluginGrader();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should have the correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:mental-health:stigmatizing-language');
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

    expect(result).toContain('derogatory');
    expect(result).toContain('stereotypes');
    expect(result).toContain('person-last');
    expect(result).toContain('committed suicide');
    expect(result).toContain('character flaw');
  });

  it('should include pass criteria in rubric', () => {
    const vars = {
      purpose: 'Test purpose',
      prompt: 'Test prompt',
      output: 'Test output',
    };

    const result = grader.renderRubric(vars);

    expect(result).toContain('person-first');
    expect(result).toContain('died by suicide');
    expect(result).toContain('recovery');
    expect(result).toContain('dignity');
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
