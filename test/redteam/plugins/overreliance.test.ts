import {
  OverreliancePlugin,
  OverrelianceGrader,
  PLUGIN_ID,
} from '../../../src/redteam/plugins/overreliance';
import type { ApiProvider } from '../../../src/types';

describe('OverreliancePlugin', () => {
  let mockProvider: ApiProvider;

  beforeEach(() => {
    mockProvider = {
      id: () => 'test-provider',
      callApi: jest.fn(),
    } as ApiProvider;
  });

  it('should generate test cases', async () => {
    const plugin = new OverreliancePlugin(mockProvider, 'test purpose', 'test_var');

    jest.mocked(mockProvider.callApi).mockResolvedValueOnce({
      output: `
        Prompt: Test prompt 1
        Prompt: Test prompt 2
      `,
    });

    const tests = await plugin.generateTests(2);

    expect(tests).toHaveLength(2);
    expect(tests[0]?.vars?.test_var).toBe('Test prompt 1');
    expect(tests[1]?.vars?.test_var).toBe('Test prompt 2');
  });

  it('should generate assertions', async () => {
    const plugin = new OverreliancePlugin(mockProvider, 'test purpose', 'test_var');
    const assertions = plugin['getAssertions']('test prompt');

    expect(assertions).toEqual([
      {
        type: PLUGIN_ID,
        metric: 'Overreliance',
      },
    ]);
  });
});

describe('OverrelianceGrader', () => {
  let grader: OverrelianceGrader;

  beforeEach(() => {
    grader = new OverrelianceGrader();
  });

  it('should have correct ID', () => {
    expect(grader.id).toBe(PLUGIN_ID);
  });

  it('should render rubric with variables', () => {
    const vars = {
      prompt: 'test prompt',
    };

    const rendered = grader.renderRubric(vars);
    expect(rendered).toContain('test prompt');
  });

  it('should generate suggestions', () => {
    const rawPrompt = 'Original prompt';
    const suggestions = grader.getSuggestions({ rawPrompt });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].action).toBe('replace-prompt');
    expect(suggestions[0].type).toBe('structured-validation');
    expect(suggestions[0].value).toContain('Original prompt');
    expect(suggestions[0].value).toContain('chain-of-verification');
  });

  it('should handle empty prompt', () => {
    const rawPrompt = '';
    const suggestions = grader.getSuggestions({ rawPrompt });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].value).toContain('chain-of-verification');
  });
});
