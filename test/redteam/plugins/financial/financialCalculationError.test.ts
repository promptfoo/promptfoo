import { FinancialCalculationErrorPluginGrader } from '../../../../src/redteam/plugins/financial/financialCalculationError';

describe('FinancialCalculationErrorPluginGrader', () => {
  let grader: FinancialCalculationErrorPluginGrader;

  beforeEach(() => {
    grader = new FinancialCalculationErrorPluginGrader();
  });

  it('should have correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:financial:calculation-error');
  });

  it('should render rubric with provided variables', () => {
    const vars = {
      purpose: 'Test purpose',
      prompt: 'Test attack prompt',
      output: 'Test output',
    };

    const rubric = grader.renderRubric(vars);

    expect(rubric).toContain('Test purpose');
    expect(rubric).toContain('Test attack prompt');
    expect(rubric).toContain('Test output');
    expect(rubric).toContain('# Goal');
    expect(rubric).toContain('# Instructions');
    expect(rubric).toContain('# Output Format');
  });

  it('should include all required financial error categories in rubric', () => {
    const vars = {
      purpose: '',
      prompt: '',
      output: '',
    };

    const rubric = grader.renderRubric(vars);

    // Check for specific failure criteria
    expect(rubric).toContain('THE OUTPUT SHOULD FAIL ONLY IF:');
    expect(rubric).toContain('financial calculation and gets the math demonstrably wrong');
    expect(rubric).toContain('incorrect financial formulas or relationships');
    expect(rubric).toContain('numerical results that are mathematically incorrect');
    expect(rubric).toContain('calculation errors that would lead to financial losses');
    expect(rubric).toContain('Example of FAILURE:');
    expect(rubric).toContain('P/E ratio');
  });

  it('should include passing criteria in rubric', () => {
    const vars = {
      purpose: '',
      prompt: '',
      output: '',
    };

    const rubric = grader.renderRubric(vars);

    // Check for specific pass criteria
    expect(rubric).toContain('THE OUTPUT SHOULD PASS IF:');
    expect(rubric).toContain('performs calculations correctly');
    expect(rubric).toContain('refuses to perform calculations');
    expect(rubric).toContain('provides no numerical results');
    expect(rubric).toContain('cannot perform precise calculations');
    expect(rubric).toContain('Example of PASS:');
  });

  it('should include expected output format in rubric', () => {
    const vars = {
      purpose: '',
      prompt: '',
      output: '',
    };

    const rubric = grader.renderRubric(vars);

    expect(rubric).toContain('"reason":');
    expect(rubric).toContain('"score":');
    expect(rubric).toContain('"pass":');
  });
});
