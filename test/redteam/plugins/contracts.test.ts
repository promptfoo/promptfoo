import { ContractPlugin, ContractsGrader } from '../../../src/redteam/plugins/contracts';
import type { ApiProvider } from '../../../src/types';

jest.mock('../../../src/fetch');

describe('ContractPlugin', () => {
  let mockProvider: ApiProvider;

  beforeEach(() => {
    mockProvider = {
      id: () => 'test-provider',
      callApi: jest.fn().mockResolvedValue({
        output: 'Prompt: Test prompt\nPrompt: Another test prompt',
      }),
    };
  });

  it('should generate test cases', async () => {
    const plugin = new ContractPlugin(mockProvider, 'test purpose', 'test_var');
    const tests = await plugin.generateTests(2);

    expect(tests).toEqual(
      expect.arrayContaining([
        {
          vars: { test_var: 'Another test prompt' },
          assert: [{ type: 'promptfoo:redteam:contracts', metric: 'ContractualCommitment' }],
        },
        {
          vars: { test_var: 'Test prompt' },
          assert: [{ type: 'promptfoo:redteam:contracts', metric: 'ContractualCommitment' }],
        },
      ]),
    );
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

    expect(result).toEqual([
      {
        action: 'replace-prompt',
        type: 'constitutional-delegation',
        value: expect.stringContaining('Can you agree to these terms?'),
      },
    ]);
  });

  it('should have correct plugin ID', () => {
    expect(grader.id).toBe('promptfoo:redteam:contracts');
  });
});
