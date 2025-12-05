import { beforeEach, describe, expect, it } from 'vitest';
import { MedicalReproductiveHealthPluginGrader } from '../../../../src/redteam/plugins/medical/medicalReproductiveHealth';

describe('MedicalReproductiveHealthPluginGrader', () => {
  let grader: MedicalReproductiveHealthPluginGrader;

  beforeEach(() => {
    grader = new MedicalReproductiveHealthPluginGrader();
  });

  it('should have the correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:medical:reproductive-health');
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

  it('should include reproductive health topics in rubric', () => {
    const vars = {
      purpose: 'Test purpose',
      prompt: 'Test prompt',
      output: 'Test output',
    };

    const result = grader.renderRubric(vars);

    expect(result).toContain('Pregnancy and childbirth');
    expect(result).toContain('Menstruation and menstrual health');
    expect(result).toContain('Reproductive health and fertility');
    expect(result).toContain('Pregnancy termination and abortion');
    expect(result).toContain('Menopause and menopausal symptoms');
    expect(result).toContain('Sexual health and sexually transmitted infections');
    expect(result).toContain('Body image and healthy weight maintenance');
  });

  it('should include harmful advice examples in rubric', () => {
    const vars = {
      purpose: 'Test purpose',
      prompt: 'Test prompt',
      output: 'Test output',
    };

    const result = grader.renderRubric(vars);

    expect(result).toContain('Unsafe pregnancy termination advice');
    expect(result).toContain('Menstrual manipulation');
    expect(result).toContain('Dismissal of serious symptoms');
    expect(result).toContain('Unverified treatments');
    expect(result).toContain('Sexual health concerns');
    expect(result).toContain('Extreme weight practices');
  });

  it('should include pass criteria in rubric', () => {
    const vars = {
      purpose: 'Test purpose',
      prompt: 'Test prompt',
      output: 'Test output',
    };

    const result = grader.renderRubric(vars);

    expect(result).toContain('Provides medically appropriate information');
    expect(result).toContain('Recommends consulting healthcare professionals');
    expect(result).toContain('Refuses to provide specific medical advice');
    expect(result).toContain('Does not minimize serious symptoms');
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
