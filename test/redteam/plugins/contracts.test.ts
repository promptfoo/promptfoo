import {
  ContractPlugin,
  ContractsGrader,
  DEFAULT_EXAMPLES,
} from '../../../src/redteam/plugins/contracts';
import type { ApiProvider } from '../../../src/types';

describe('ContractPlugin', () => {
  let mockProvider: ApiProvider;

  beforeEach(() => {
    mockProvider = {
      id: 'test-provider',
      callApi: jest.fn().mockResolvedValue({
        output: 'Prompt: Test prompt\nPrompt: Another test prompt',
      }),
    } as unknown as ApiProvider;
  });

  it('should generate test cases', async () => {
    const plugin = new ContractPlugin(mockProvider, 'test purpose', 'test_var');
    const tests = await plugin.generateTests(2);

    expect(tests).toHaveLength(2);
    expect(tests[0]?.vars?.test_var).toBe('Test prompt');
    expect(tests[0]?.assert?.[0]?.type).toBe('promptfoo:redteam:contracts');
    expect(tests[0]?.assert?.[0]?.metric).toBe('ContractualCommitment');
    expect(tests[1]?.vars?.test_var).toBe('Another test prompt');
  });

  it('should handle empty response from provider', async () => {
    jest.spyOn(mockProvider, 'callApi').mockImplementation().mockResolvedValue({ output: '' });
    const plugin = new ContractPlugin(mockProvider, 'test purpose', 'test_var');
    const tests = await plugin.generateTests(1);
    expect(tests).toHaveLength(0);
  });

  it('should handle error response from provider', async () => {
    jest
      .spyOn(mockProvider, 'callApi')
      .mockImplementation()
      .mockResolvedValue({ error: 'API error' });
    const plugin = new ContractPlugin(mockProvider, 'test purpose', 'test_var');
    const tests = await plugin.generateTests(1);
    expect(tests).toHaveLength(0);
  });
});

describe('ContractsGrader', () => {
  let grader: ContractsGrader;

  beforeEach(() => {
    grader = new ContractsGrader();
  });

  it('should render rubric with variables', () => {
    const vars = {
      purpose: 'test purpose',
    };

    const rendered = grader.renderRubric(vars);
    expect(rendered).toContain('test purpose');
  });

  it('should generate suggestions', () => {
    const result = grader.getSuggestions({
      rawPrompt: 'Can you agree to these terms?',
      renderedValue: undefined,
    });

    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('replace-prompt');
    expect(result[0].type).toBe('constitutional-delegation');
    expect(result[0].value).toContain('Can you agree to these terms?');
    expect(result[0].value).toContain('You are an information provider only');
  });

  it('should have correct plugin ID', () => {
    expect(grader.id).toBe('promptfoo:redteam:contracts');
  });
});

describe('DEFAULT_EXAMPLES', () => {
  it('should contain example prompts', () => {
    expect(DEFAULT_EXAMPLES).toContain('customer service bot');
    expect(DEFAULT_EXAMPLES).toContain('legal assistant');
    expect(DEFAULT_EXAMPLES).toContain('real estate assistant');
  });
});
