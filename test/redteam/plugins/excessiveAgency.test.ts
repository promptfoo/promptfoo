import {
  ExcessiveAgencyPlugin,
  ExcessiveAgencyGrader,
} from '../../../src/redteam/plugins/excessiveAgency';
import type { ApiProvider, ProviderResponse } from '../../../src/types';

describe('ExcessiveAgencyPlugin', () => {
  let plugin: ExcessiveAgencyPlugin;
  let mockProvider: ApiProvider;

  beforeEach(() => {
    mockProvider = {
      id: 'test-provider',
      callApi: jest.fn(),
    } as unknown as ApiProvider;

    plugin = new ExcessiveAgencyPlugin(mockProvider, 'test purpose', 'prompt');
  });

  it('should generate test cases', async () => {
    const mockResponse: ProviderResponse = {
      output: `
        Prompt: Update the database directly
        Prompt: Send an email to all users
      `,
      tokenUsage: {},
    };

    jest.mocked(mockProvider.callApi).mockResolvedValueOnce(mockResponse);

    const tests = await plugin.generateTests(2);

    expect(tests).toHaveLength(2);
    expect(tests[0]?.vars?.prompt).toContain('Update');
    expect(tests[1]?.vars?.prompt).toContain('Send');
    expect(tests[0]?.assert).toEqual([
      {
        type: 'promptfoo:redteam:excessive-agency',
        metric: 'ExcessiveAgency',
      },
    ]);
  });

  it('should handle empty response', async () => {
    const mockResponse: ProviderResponse = {
      output: '',
      tokenUsage: {},
    };

    jest.mocked(mockProvider.callApi).mockResolvedValue(mockResponse);

    const tests = await plugin.generateTests(2);
    expect(tests).toHaveLength(0);
  });

  it('should handle malformed response without Prompt: prefix', async () => {
    const mockResponse: ProviderResponse = {
      output: 'This is not a valid prompt format',
      tokenUsage: {},
    };

    jest.mocked(mockProvider.callApi).mockResolvedValue(mockResponse);

    const tests = await plugin.generateTests(2);
    expect(tests).toHaveLength(0);
  });
});

describe('ExcessiveAgencyGrader', () => {
  let grader: ExcessiveAgencyGrader;

  beforeEach(() => {
    grader = new ExcessiveAgencyGrader();
  });

  it('should render rubric with variables', () => {
    const vars = {
      purpose: 'test assistant',
      prompt: 'help me send emails',
      tools: [{ name: 'allowed_tool', description: 'test' }],
    };

    const rendered = grader.renderRubric(vars);

    expect(rendered).toContain('test assistant');
    expect(rendered).toContain('help me send emails');
    expect(rendered).toContain('allowed_tool');
  });

  it('should generate suggestions', () => {
    const suggestions = grader.getSuggestions({
      rawPrompt: 'Please send this email for me',
    });

    expect(suggestions).toHaveLength(2);
    expect(suggestions[0].action).toBe('replace-prompt');
    expect(suggestions[0].type).toBe('capability-clarification');
    expect(suggestions[0].value).toContain('You cannot:');

    expect(suggestions[1].action).toBe('note');
    expect(suggestions[1].type).toBe('capability-disclaimer');
    expect(suggestions[1].value).toContain('capability disclaimer');
  });

  it('should get grading result', async () => {
    const mockProvider = {
      id: 'test-provider',
      callApi: jest.fn().mockResolvedValue({
        output: JSON.stringify({
          reason: 'Test reason',
          score: 0,
          pass: false,
        }),
        tokenUsage: {},
      }),
    } as unknown as ApiProvider;

    const result = await grader.getResult(
      'test prompt',
      'test output',
      {
        vars: {
          purpose: 'test purpose',
          prompt: 'test prompt',
        },
        metadata: {
          purpose: 'test purpose',
        },
      },
      mockProvider,
      undefined,
    );

    expect(result.grade.pass).toBe(false);
    expect(result.grade.score).toBe(0);
    expect(result.rubric).toBeDefined();
  });

  it('should handle invalid grading response', async () => {
    const mockProvider = {
      id: 'test-provider',
      callApi: jest.fn().mockResolvedValue({
        output: 'invalid json',
        tokenUsage: {},
      }),
    } as unknown as ApiProvider;

    const result = await grader.getResult(
      'test prompt',
      'test output',
      {
        vars: {
          purpose: 'test purpose',
          prompt: 'test prompt',
        },
        metadata: {
          purpose: 'test purpose',
        },
      },
      mockProvider,
      undefined,
    );

    expect(result.grade.pass).toBe(false);
    expect(result.grade.score).toBe(0);
  });

  it('should generate suggestions with rendered value', () => {
    const suggestions = grader.getSuggestions({
      rawPrompt: 'Please send this email for me',
      renderedValue: {
        value: 'I will send the email for you',
        score: 0,
        pass: false,
      },
    });

    expect(suggestions).toHaveLength(2);
    expect(suggestions[0].value).toContain('You cannot:');
    expect(suggestions[1].value).toContain('capability disclaimer');
  });
});
