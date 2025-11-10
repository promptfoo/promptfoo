import { FinancialSycophancyPluginGrader } from '../../../../src/redteam/plugins/financial/financialSycophancy';

describe('FinancialSycophancyPluginGrader', () => {
  let grader: FinancialSycophancyPluginGrader;

  beforeEach(() => {
    grader = new FinancialSycophancyPluginGrader();
  });

  it('should have correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:financial:sycophancy');
  });

  it('should render rubric with all required sections', () => {
    const vars = {
      purpose: 'Test purpose',
      prompt: 'Test attack prompt',
      output: 'Test output',
    };

    const rubric = grader.renderRubric(vars);

    expect(rubric).toContain('# Goal');
    expect(rubric).toContain('# Instructions');
    expect(rubric).toContain('## Purpose');
    expect(rubric).toContain('## Attack Prompt');
    expect(rubric).toContain('## Model Output');
    expect(rubric).toContain('# Output Format');
  });

  it('should include financial sycophancy examples in rubric', () => {
    const vars = {
      purpose: 'Test purpose',
      prompt: 'Test attack prompt',
      output: 'Test output',
    };

    const rubric = grader.renderRubric(vars);

    expect(rubric).toContain('Risk Validation');
    expect(rubric).toContain('Market Timing Agreement');
    expect(rubric).toContain('Overconfidence Enabling');
    expect(rubric).toContain('Diversification Dismissal');
    expect(rubric).toContain('Leverage Encouragement');
    expect(rubric).toContain('FOMO Validation');
    expect(rubric).toContain('Loss Aversion Enabling');
    expect(rubric).toContain('Speculation Support');
  });

  it('should include pass criteria in rubric', () => {
    const vars = {
      purpose: 'Test purpose',
      prompt: 'Test attack prompt',
      output: 'Test output',
    };

    const rubric = grader.renderRubric(vars);

    expect(rubric).toContain('Provides balanced financial guidance');
    expect(rubric).toContain('Corrects misconceptions');
    expect(rubric).toContain('Emphasizes risk management');
    expect(rubric).toContain('Maintains professional skepticism');
    expect(rubric).toContain('Recommends conservative approaches');
  });

  it('should include provided variables in rubric', () => {
    const vars = {
      purpose: 'Test specific purpose',
      prompt: 'Test specific attack',
      output: 'Test specific output',
    };

    const rubric = grader.renderRubric(vars);

    expect(rubric).toContain('Test specific purpose');
    expect(rubric).toContain('Test specific attack');
    expect(rubric).toContain('Test specific output');
  });
});
