import { describe, expect, it } from 'vitest';
import { getGraderById } from '../../../src/redteam/graders';
import { FinancialKoreaConsumerProtectionPluginGrader } from '../../../src/redteam/plugins/financial/financialKoreaConsumerProtection';

describe('FinancialKoreaConsumerProtectionPluginGrader', () => {
  const vars = {
    purpose: 'Korean bank product consultation chatbot',
    prompt: 'Sentinel attack prompt for rubric interpolation',
    output: 'Sentinel model output for rubric interpolation',
  };

  it('should have the correct plugin ID', () => {
    const grader = new FinancialKoreaConsumerProtectionPluginGrader();
    expect(grader.id).toBe('promptfoo:redteam:financial:korea-consumer-protection');
  });

  it('should be registered under its canonical grader id', () => {
    expect(getGraderById('promptfoo:redteam:financial:korea-consumer-protection')).toBeInstanceOf(
      FinancialKoreaConsumerProtectionPluginGrader,
    );
  });

  it('should render runtime context and decision fields', () => {
    const rubric = new FinancialKoreaConsumerProtectionPluginGrader().renderRubric(vars);

    expect(rubric).toContain(vars.purpose);
    expect(rubric).toContain(vars.prompt);
    expect(rubric).toContain(vars.output);
    expect(rubric).toContain('# Goal');
    expect(rubric).toContain('# Instructions');
    expect(rubric).toContain('# Output Format');
    expect(rubric).toContain('"reason":');
    expect(rubric).toContain('"score":');
    expect(rubric).toContain('"pass":');
  });

  it('should cover all six Financial Consumer Protection Act sales principles', () => {
    const rubric = new FinancialKoreaConsumerProtectionPluginGrader().renderRubric(vars);

    expect(rubric).toContain('Art. 17');
    expect(rubric).toContain('Art. 18');
    expect(rubric).toContain('Art. 19');
    expect(rubric).toContain('Art. 20');
    expect(rubric).toContain('Art. 21');
    expect(rubric).toContain('Art. 22');
  });

  it('should cover Korea-specific prohibitions beyond suitability', () => {
    const rubric = new FinancialKoreaConsumerProtectionPluginGrader()
      .renderRubric(vars)
      .toLowerCase();

    // Art. 20 tying
    expect(rubric).toContain('tying');
    // Art. 21 definitive judgments on uncertain returns
    expect(rubric).toContain('definitive judgment');
    // Art. 22 advertising
    expect(rubric).toContain('advertising');
    // Vulnerable-customer steering
    expect(rubric).toContain('elderly');
    expect(rubric).toContain('first-time');
  });

  it('should model Article 18 as the execution-only confirmation duty', () => {
    const rubric = new FinancialKoreaConsumerProtectionPluginGrader().renderRubric(vars);

    expect(rubric).toContain('execution-only');
    expect(rubric).toContain('obtaining confirmation');
  });

  it('should note that prompts and outputs may be in Korean or English', () => {
    const rubric = new FinancialKoreaConsumerProtectionPluginGrader().renderRubric(vars);

    expect(rubric).toContain('Korean or English');
  });
});
