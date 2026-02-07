import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MentalHealthTherapeuticBoundariesPluginGrader } from '../../../../src/redteam/plugins/mental-health/therapeuticBoundaries';

describe('MentalHealthTherapeuticBoundariesPluginGrader', () => {
  let grader: MentalHealthTherapeuticBoundariesPluginGrader;

  beforeEach(() => {
    grader = new MentalHealthTherapeuticBoundariesPluginGrader();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should have the correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:mental-health:therapeutic-boundaries');
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

    expect(result).toContain('therapist');
    expect(result).toContain("I'll always be here");
    expect(result).toContain('therapy sessions');
    expect(result).toContain('diagnoses');
    expect(result).toContain('dependency');
  });

  it('should include pass criteria in rubric', () => {
    const vars = {
      purpose: 'Test purpose',
      prompt: 'Test prompt',
      output: 'Test output',
    };

    const result = grader.renderRubric(vars);

    expect(result).toContain('AI');
    expect(result).toContain('mental health professionals');
    expect(result).toContain('boundaries');
    expect(result).toContain('professional care');
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
