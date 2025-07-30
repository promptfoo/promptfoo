import {
  DEFAULT_EXAMPLES,
  ShellInjectionGrader,
  ShellInjectionPlugin,
} from '../../../src/redteam/plugins/shellInjection';

import type { RedteamObjectConfig } from '../../../src/redteam/types';
import type { ApiProvider } from '../../../src/types';

describe('ShellInjectionPlugin', () => {
  let mockProvider: ApiProvider;

  beforeEach(() => {
    mockProvider = {
      id: () => 'test-provider',
      callApi: jest.fn().mockResolvedValue({
        output: 'Prompt: rm -rf /\nPrompt: cat /etc/passwd',
      }),
    } as ApiProvider;
  });

  it('should generate template with default examples when no examples provided', async () => {
    const plugin = new ShellInjectionPlugin(mockProvider, 'test purpose', 'test_var');
    const template = await plugin['getTemplate']();

    expect(template).toContain('AI code review assistant');
    expect(template).toContain('developer productivity chatbot');
    expect(template).toContain('CI/CD pipeline assistant');
    expect(template).toContain('compliance audit assistant');
  });

  it('should generate template with custom examples', async () => {
    const customConfig = {
      examples: [
        'System purpose: Custom Bot 1\nPrompt: Custom Command 1',
        'System purpose: Custom Bot 2\nPrompt: Custom Command 2',
      ],
    } as RedteamObjectConfig;

    const plugin = new ShellInjectionPlugin(mockProvider, 'test purpose', 'test_var', customConfig);
    const template = await plugin['getTemplate']();

    expect(template).toContain('Context-specific examples:');
    expect(template).toContain('Examples targeting security boundary violations:');
    expect(template).toContain('{{ example | trim }}');
    expect(template).not.toContain('Custom Bot 1');
    expect(template).not.toContain('Custom Command 1');
    expect(template).not.toContain('Custom Bot 2');
    expect(template).not.toContain('Custom Command 2');
  });

  it('should return correct assertions for a prompt', () => {
    const plugin = new ShellInjectionPlugin(mockProvider, 'test purpose', 'test_var');
    const assertions = plugin['getAssertions']('test prompt');

    expect(assertions).toHaveLength(1);
    expect(assertions[0]).toEqual({
      type: 'promptfoo:redteam:shell-injection',
      metric: 'ShellInjection',
    });
  });

  it('should generate test cases with correct plugin ID in assertions', async () => {
    const plugin = new ShellInjectionPlugin(mockProvider, 'test purpose', 'test_var');
    const tests = await plugin.generateTests(2);

    expect(tests).toHaveLength(2);
    tests.forEach((test) => {
      expect(test.assert).toHaveLength(1);
      expect(test.assert?.[0].type).toBe('promptfoo:redteam:shell-injection');
      expect(test.assert?.[0].metric).toBe('ShellInjection');
    });
  });

  it('should handle empty examples config', async () => {
    const emptyConfig = { examples: [] } as any as RedteamObjectConfig;
    const plugin = new ShellInjectionPlugin(mockProvider, 'test purpose', 'test_var', emptyConfig);
    const template = await plugin['getTemplate']();

    expect(template).toContain('Examples targeting security boundary violations:');
    expect(template).toContain(DEFAULT_EXAMPLES);
  });

  it('should handle undefined examples config', async () => {
    const plugin = new ShellInjectionPlugin(mockProvider, 'test purpose', 'test_var', undefined);
    const template = await plugin['getTemplate']();

    expect(template).toContain('Examples targeting security boundary violations:');
    expect(template).toContain(DEFAULT_EXAMPLES);
  });

  it('should handle malformed examples config', async () => {
    const malformedConfig = {
      examples: [
        {
          purpose: 'Malformed',
          content: 'Some invalid content',
        } as any,
      ],
    } as any as RedteamObjectConfig;

    const plugin = new ShellInjectionPlugin(
      mockProvider,
      'test purpose',
      'test_var',
      malformedConfig,
    );
    const template = await plugin['getTemplate']();

    expect(template).toContain('Examples targeting security boundary violations:');
    expect(template).toContain(DEFAULT_EXAMPLES);
  });

  it('should expose DEFAULT_EXAMPLES as a string containing all new examples', () => {
    expect(DEFAULT_EXAMPLES).toContain('AI code review assistant for development teams');
    expect(DEFAULT_EXAMPLES).toContain('developer productivity chatbot');
    expect(DEFAULT_EXAMPLES).toContain('CI/CD pipeline assistant');
    expect(DEFAULT_EXAMPLES).toContain('compliance audit assistant');
    expect(DEFAULT_EXAMPLES).toContain('document management chatbot');
    expect(DEFAULT_EXAMPLES).toContain('internal RAG log assistant chatbot');
    expect(DEFAULT_EXAMPLES).toContain('QA automation assistant');
    expect(DEFAULT_EXAMPLES).toContain('knowledge base assistant for technical documentation');
  });
});

describe('ShellInjectionGrader', () => {
  let grader: ShellInjectionGrader;

  beforeEach(() => {
    grader = new ShellInjectionGrader();
  });

  it('should have correct ID', () => {
    expect(grader.id).toBe('promptfoo:redteam:shell-injection');
  });

  it('should have non-empty rubric', () => {
    expect(grader.rubric).toBeTruthy();
    expect(typeof grader.rubric).toBe('string');
  });

  it('should include key evaluation criteria in rubric', () => {
    expect(grader.rubric).toContain('The output should not execute');
    expect(grader.rubric).toContain('Security warnings');
    expect(grader.rubric).toContain('Input validation errors');
    expect(grader.rubric).toContain(
      'Generic error messages that do not indicate command execution',
    );
    expect(grader.rubric).toContain(
      'Example code snippets not from result of executing the command',
    );
  });

  it('should contain guidance about acceptable responses', () => {
    expect(grader.rubric).toContain('Acceptable responses include:');
    expect(grader.rubric).toContain('Avoid false positives');
  });
});
