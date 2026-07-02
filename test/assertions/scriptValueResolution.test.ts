import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertion, runAssertions } from '../../src/assertions/index';
import cliState from '../../src/cliState';
import { importModule } from '../../src/esm';
import * as llmGradingMatchers from '../../src/matchers/llmGrading';
import { runRuby } from '../../src/ruby/rubyUtils.js';
import { withProviderCallExecutionContext } from '../../src/scheduler/providerCallExecutionContext';
import { ProviderGroupedCallQueue } from '../../src/scheduler/providerCallQueue';

import type { ProviderResponse } from '../../src/types/index';

// Mock dependencies
vi.mock('../../src/redteam/remoteGeneration', () => ({
  shouldGenerateRemote: vi.fn().mockReturnValue(false),
}));

vi.mock('libsql');

vi.mock('proxy-agent', () => ({
  ProxyAgent: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('node:module', () => {
  const mockRequire: NodeJS.Require = {
    resolve: vi.fn() as unknown as NodeJS.RequireResolve,
  } as unknown as NodeJS.Require;
  return {
    createRequire: vi.fn().mockReturnValue(mockRequire),
  };
});

vi.mock('glob', () => ({
  globSync: vi.fn(),
}));

vi.mock('../../src/esm', () => ({
  importModule: vi.fn(),
  getDirectory: vi.fn().mockReturnValue('/test/dir'),
}));
vi.mock('../../src/database', () => ({
  getDb: vi.fn(),
}));

vi.mock('../../src/ruby/rubyUtils.js', () => ({
  runRuby: vi.fn(),
}));

vi.mock('../../src/matchers/llmGrading', async () => {
  const actual = await vi.importActual('../../src/matchers/llmGrading');
  return {
    ...actual,
    matchesLlmRubric: vi.fn().mockResolvedValue({ pass: true, score: 1, reason: 'Mocked' }),
    matchesFactuality: vi.fn().mockResolvedValue({ pass: true, score: 1, reason: 'Mocked' }),
    matchesClosedQa: vi.fn().mockResolvedValue({ pass: true, score: 1, reason: 'Mocked' }),
  };
});

vi.mock('../../src/matchers/similarity', async () => {
  const actual = await vi.importActual('../../src/matchers/similarity');
  return {
    ...actual,
    matchesSimilarity: vi.fn().mockResolvedValue({ pass: true, score: 1, reason: 'Mocked' }),
  };
});

describe('Script value resolution', () => {
  const originalBasePath = cliState.basePath;

  beforeEach(() => {
    vi.resetAllMocks();

    // Restore importModule mock implementation after reset
    vi.mocked(importModule).mockImplementation((filePath: string, functionName?: string) => {
      const mod = require(path.resolve(filePath));
      if (functionName) {
        return Promise.resolve(mod[functionName]);
      }
      return Promise.resolve(mod);
    });

    cliState.basePath = path.resolve(__dirname, '../fixtures/file-script-assertions');
  });

  afterEach(() => {
    cliState.basePath = originalBasePath;
    vi.resetAllMocks();
  });

  const baseProviderResponse: ProviderResponse = {
    output: 'test output',
    tokenUsage: { total: 0, prompt: 0, completion: 0 },
  };

  describe('llm-rubric with file:// script', () => {
    it('should pass script output to matchesLlmRubric', async () => {
      const mockMatchesLlmRubric = vi.mocked(llmGradingMatchers.matchesLlmRubric);
      mockMatchesLlmRubric.mockResolvedValue({ pass: true, score: 1, reason: 'Mocked' });

      await runAssertion({
        assertion: {
          type: 'llm-rubric',
          value: 'file://rubric-generator.cjs:knownValue',
        },
        test: { vars: {}, options: { provider: { id: 'echo' } } },
        providerResponse: baseProviderResponse,
      });

      expect(mockMatchesLlmRubric).toHaveBeenCalledWith(
        'SCRIPT_OUTPUT_12345', // Script output, NOT file path
        expect.any(String),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        undefined,
        undefined,
      );
    });

    it('should pass direct value to matchesLlmRubric when no script', async () => {
      const mockMatchesLlmRubric = vi.mocked(llmGradingMatchers.matchesLlmRubric);
      mockMatchesLlmRubric.mockResolvedValue({ pass: true, score: 1, reason: 'Mocked' });

      await runAssertion({
        assertion: {
          type: 'llm-rubric',
          value: 'direct rubric text',
        },
        test: { vars: {}, options: { provider: { id: 'echo' } } },
        providerResponse: baseProviderResponse,
      });

      expect(mockMatchesLlmRubric).toHaveBeenCalledWith(
        'direct rubric text',
        expect.any(String),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        undefined,
        undefined,
      );
    });

    it('should pass object returned by script to matchesLlmRubric', async () => {
      const mockMatchesLlmRubric = vi.mocked(llmGradingMatchers.matchesLlmRubric);
      mockMatchesLlmRubric.mockResolvedValue({ pass: true, score: 1, reason: 'Mocked' });

      await runAssertion({
        assertion: {
          type: 'llm-rubric',
          value: 'file://rubric-generator.cjs:rubricObject',
        },
        test: { vars: {}, options: { provider: { id: 'echo' } } },
        providerResponse: baseProviderResponse,
      });

      expect(mockMatchesLlmRubric).toHaveBeenCalledWith(
        { role: 'system', content: 'Evaluate the response for accuracy' },
        expect.any(String),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        undefined,
        undefined,
      );
    });
  });

  describe('contains with file:// script', () => {
    it('should use script output for contains assertion', async () => {
      const result = await runAssertion({
        assertion: {
          type: 'contains',
          value: 'file://rubric-generator.cjs:knownValue',
        },
        test: { vars: {} },
        providerResponse: {
          output: 'The answer is SCRIPT_OUTPUT_12345 here',
          tokenUsage: { total: 0, prompt: 0, completion: 0 },
        },
      });

      expect(result.pass).toBe(true);
    });

    it('should fail when output does not contain script value', async () => {
      const result = await runAssertion({
        assertion: {
          type: 'contains',
          value: 'file://rubric-generator.cjs:knownValue',
        },
        test: { vars: {} },
        providerResponse: {
          output: 'wrong output',
          tokenUsage: { total: 0, prompt: 0, completion: 0 },
        },
      });

      expect(result.pass).toBe(false);
      // Verify error message contains script output, not file path
      expect(result.reason).toContain('SCRIPT_OUTPUT_12345');
      expect(result.reason).not.toContain('file://');
    });

    it('should use numeric script output for contains assertion', async () => {
      const result = await runAssertion({
        assertion: {
          type: 'contains',
          value: 'file://rubric-generator.cjs:numericValue',
        },
        test: { vars: {} },
        providerResponse: {
          output: 'The answer is 42',
          tokenUsage: { total: 0, prompt: 0, completion: 0 },
        },
      });

      expect(result.pass).toBe(true);
    });
  });

  it('grades MCP provenance captured before a file assertion script mutates context', async () => {
    const result = await runAssertion({
      assertion: {
        type: 'is-valid-openai-tools-call',
        value: 'file://rubric-generator.cjs:mutateMcpMetadata',
      },
      test: { vars: {} },
      providerResponse: {
        output: 'MCP Tool Error (search): real failure',
        metadata: {
          mcpToolCalls: [{ name: 'search', status: 'error', error: 'real failure' }],
        },
      },
    });

    expect(result).toMatchObject({
      pass: false,
      score: 0,
      reason: 'MCP tool call failed for search: real failure',
    });
  });

  it.each([
    ['is-valid-openai-tools-call', false],
    ['not-is-valid-openai-tools-call', true],
  ] as const)('keeps the captured transform decision when a file script mutates %s', async (type, expectedPass) => {
    const assertion = {
      type,
      transform: () => 'ordinary transformed text',
      value: 'file://rubric-generator.cjs:deleteAssertionTransform',
    } as const;
    const test = { vars: {}, assert: [assertion] };

    const result = await runAssertion({
      assertion,
      test,
      providerResponse: {
        output: 'MCP Tool Result (search): ok',
        raw: {
          output: [{ type: 'mcp_call', name: 'search', status: 'completed', output: 'ok' }],
        },
      },
    });

    expect(result).toMatchObject({
      pass: expectedPass,
      score: expectedPass ? 1 : 0,
      reason: expect.stringContaining('did not return a valid-looking tools response'),
    });
  });

  it('does not let a file script add rendered-MCP authorization', async () => {
    const result = await runAssertion({
      assertion: {
        type: 'is-valid-openai-tools-call',
        value: 'file://rubric-generator.cjs:addTrustedMcpBrand',
      },
      test: { vars: {} },
      providerResponse: {
        output: 'MCP Tool Result (spoof): model-controlled marker',
      },
    });

    expect(result).toMatchObject({ pass: false, score: 0 });
  });

  it('keeps direct-dispatch polarity when its file script mutates the live assertion type', async () => {
    const assertion = {
      type: 'is-valid-openai-tools-call',
      value: 'file://rubric-generator.cjs:invertAssertionType',
    } as const;
    const test = { vars: {}, assert: [assertion] };

    const result = await runAssertion({
      assertion,
      test,
      providerResponse: { output: 'ordinary model text' },
    });

    expect(result).toMatchObject({
      pass: false,
      score: 0,
      assertion: { type: 'is-valid-openai-tools-call' },
    });
    expect(test.assert[0].type).toBe('not-is-valid-openai-tools-call');
  });

  describe.each([
    'concurrent',
    'serial',
  ] as const)('batch MCP state capture (%s dispatch)', (dispatchMode) => {
    const runBatch = (
      test: Parameters<typeof runAssertions>[0]['test'],
      providerResponse: ProviderResponse,
      provider?: Parameters<typeof runAssertions>[0]['provider'],
      prompt?: string,
    ) => {
      const run = () => runAssertions({ prompt, provider, providerResponse, test });
      return dispatchMode === 'serial'
        ? withProviderCallExecutionContext(
            { providerCallQueue: new ProviderGroupedCallQueue() },
            run,
          )
        : run();
    };

    it('does not let a sibling authorize and rewrite untrusted marker text', async () => {
      const providerResponse: ProviderResponse = { output: 'ordinary model text' };
      const result = await runBatch(
        {
          vars: {},
          assert: [
            {
              type: 'javascript',
              value: (_output: string, context: any) => {
                context.providerResponse[Symbol.for('promptfoo.trustedMcpRenderedOutput')] = true;
                context.providerResponse.output = 'MCP Tool Result (spoof): rewritten';
                return true;
              },
            },
            { type: 'is-valid-openai-tools-call' },
            { type: 'not-is-valid-openai-tools-call' },
          ],
        },
        providerResponse,
      );

      expect(result.componentResults?.[1]).toMatchObject({ pass: false, score: 0 });
      expect(result.componentResults?.[2]).toMatchObject({ pass: true, score: 1 });
    });

    it('grades the originally authorized marker after a sibling rewrites live output', async () => {
      const providerResponse: ProviderResponse = {
        output: 'MCP Tool Result (search): original',
        [Symbol.for('promptfoo.trustedMcpRenderedOutput')]: true,
      };
      const result = await runBatch(
        {
          vars: {},
          assert: [
            {
              type: 'javascript',
              value: (_output: string, context: any) => {
                context.providerResponse.output = 'ordinary rewritten text';
                return true;
              },
            },
            { type: 'is-valid-openai-tools-call' },
            { type: 'not-is-valid-openai-tools-call' },
          ],
        },
        providerResponse,
      );

      expect(result.componentResults?.[1]).toMatchObject({ pass: true, score: 1 });
      expect(result.componentResults?.[2]).toMatchObject({ pass: false, score: 0 });
    });

    it('retains sibling assertion transforms captured before mutation', async () => {
      const transform = () => 'ordinary transformed text';
      const providerResponse: ProviderResponse = {
        output: 'MCP Tool Result (search): original',
        raw: {
          output: [{ type: 'mcp_call', name: 'search', status: 'completed', output: 'ok' }],
        },
      };
      const result = await runBatch(
        {
          vars: {},
          assert: [
            {
              type: 'javascript',
              value: (_output: string, context: any) => {
                delete context.test.assert[1].transform;
                delete context.test.assert[2].transform;
                return true;
              },
            },
            { type: 'is-valid-openai-tools-call', transform },
            { type: 'not-is-valid-openai-tools-call', transform },
          ],
        },
        providerResponse,
      );

      expect(result.componentResults?.[1]).toMatchObject({ pass: false, score: 0 });
      expect(result.componentResults?.[2]).toMatchObject({ pass: true, score: 1 });
    });

    it('retains sibling assertion polarity captured before mutation', async () => {
      const result = await runBatch(
        {
          vars: {},
          assert: [
            {
              type: 'javascript',
              value: (_output: string, context: any) => {
                context.test.assert[1].type = 'not-is-valid-openai-tools-call';
                return true;
              },
            },
            { type: 'is-valid-openai-tools-call' },
          ],
        },
        { output: 'ordinary model text' },
      );

      expect(result.componentResults?.[1]).toMatchObject({
        pass: false,
        score: 0,
        assertion: { type: 'is-valid-openai-tools-call' },
      });
    });

    it.each([
      'is-valid-function-call',
      'is-valid-openai-function-call',
    ] as const)('retains %s polarity captured before mutation', async (targetType) => {
      const provider = {
        id: () => 'function-validator',
        callApi: async () => ({}),
        validateFunctionToolCall: () => {
          throw new Error('invalid call');
        },
      };
      const result = await runBatch(
        {
          vars: {},
          assert: [
            {
              type: 'javascript',
              value: (_output: string, context: any) => {
                context.test.assert[1].type = `not-${targetType}`;
                return true;
              },
            },
            { type: targetType },
          ],
        },
        { output: '{}' },
        provider,
      );

      expect(result.componentResults?.[1]).toMatchObject({
        pass: false,
        score: 0,
        assertion: { type: targetType },
      });
    });

    it('retains model-graded ClosedQA polarity captured before mutation', async () => {
      vi.mocked(llmGradingMatchers.matchesClosedQa).mockResolvedValue({
        pass: true,
        score: 1,
        reason: 'criterion satisfied',
      });
      const result = await runBatch(
        {
          vars: {},
          assert: [
            {
              type: 'javascript',
              value: (_output: string, context: any) => {
                context.test.assert[1].type = 'not-model-graded-closedqa';
                return true;
              },
            },
            { type: 'model-graded-closedqa', value: 'criterion' },
          ],
        },
        { output: 'answer' },
        undefined,
        'question',
      );

      expect(result.componentResults?.[1]).toMatchObject({
        pass: true,
        score: 1,
        assertion: { type: 'model-graded-closedqa' },
      });
    });
  });

  describe('equals with file:// script', () => {
    it('should use script output for equals assertion', async () => {
      const result = await runAssertion({
        assertion: {
          type: 'equals',
          value: 'file://rubric-generator.cjs:knownValue',
        },
        test: { vars: {} },
        providerResponse: {
          output: 'SCRIPT_OUTPUT_12345',
          tokenUsage: { total: 0, prompt: 0, completion: 0 },
        },
      });

      expect(result.pass).toBe(true);
    });

    it('should fail when output does not equal script value', async () => {
      const result = await runAssertion({
        assertion: {
          type: 'equals',
          value: 'file://rubric-generator.cjs:knownValue',
        },
        test: { vars: {} },
        providerResponse: {
          output: 'wrong output',
          tokenUsage: { total: 0, prompt: 0, completion: 0 },
        },
      });

      expect(result.pass).toBe(false);
    });
  });

  describe('regex with file:// script', () => {
    it('should use script output as regex pattern', async () => {
      const result = await runAssertion({
        assertion: {
          type: 'regex',
          value: 'file://rubric-generator.cjs:getPattern',
        },
        test: { vars: { pattern: '\\d+' } },
        providerResponse: {
          output: 'Code: 12345',
          tokenUsage: { total: 0, prompt: 0, completion: 0 },
        },
      });

      expect(result.pass).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should throw error when script returns function for non-script assertion', async () => {
      await expect(
        runAssertion({
          assertion: {
            type: 'equals',
            value: 'file://rubric-generator.cjs:functionValue',
          },
          test: { vars: {} },
          providerResponse: baseProviderResponse,
        }),
      ).rejects.toThrow(/Script for "equals" assertion returned a function/);
    });

    it('should throw error when script returns boolean for non-script assertion', async () => {
      await expect(
        runAssertion({
          assertion: {
            type: 'contains',
            value: 'file://rubric-generator.cjs:booleanValue',
          },
          test: { vars: {} },
          providerResponse: baseProviderResponse,
        }),
      ).rejects.toThrow(/Script for "contains" assertion returned a boolean/);
    });

    it('should throw error when script returns GradingResult for non-script assertion', async () => {
      await expect(
        runAssertion({
          assertion: {
            type: 'llm-rubric',
            value: 'file://rubric-generator.cjs:gradingResultValue',
          },
          test: { vars: {}, options: { provider: { id: 'echo' } } },
          providerResponse: baseProviderResponse,
        }),
      ).rejects.toThrow(/Script for "llm-rubric" assertion returned a GradingResult/);
    });
  });

  // REGRESSION TESTS: Ensure javascript/python/ruby assertions still work correctly
  describe('javascript assertion regression', () => {
    it('should use script return value as assertion result (NOT as comparison)', async () => {
      // The gradingFunction returns { pass: true, score: 1, reason: '...' } when output contains 'expected'
      const result = await runAssertion({
        assertion: {
          type: 'javascript',
          value: 'file://rubric-generator.cjs:gradingFunction',
        },
        test: { vars: {} },
        providerResponse: {
          output: 'this contains expected word',
          tokenUsage: { total: 0, prompt: 0, completion: 0 },
        },
      });

      expect(result.pass).toBe(true);
      expect(result.reason).toContain('expected');
    });

    it('should fail when javascript grading function returns false', async () => {
      const result = await runAssertion({
        assertion: {
          type: 'javascript',
          value: 'file://rubric-generator.cjs:gradingFunction',
        },
        test: { vars: {} },
        providerResponse: {
          output: 'does not contain the magic word',
          tokenUsage: { total: 0, prompt: 0, completion: 0 },
        },
      });

      expect(result.pass).toBe(false);
    });

    it('should work with inline javascript code', async () => {
      const result = await runAssertion({
        assertion: {
          type: 'javascript',
          value: 'output.includes("hello")',
        },
        test: { vars: {} },
        providerResponse: {
          output: 'hello world',
          tokenUsage: { total: 0, prompt: 0, completion: 0 },
        },
      });

      expect(result.pass).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string from script', async () => {
      const result = await runAssertion({
        assertion: {
          type: 'equals',
          value: 'file://rubric-generator.cjs:emptyValue',
        },
        test: { vars: {} },
        providerResponse: {
          output: '',
          tokenUsage: { total: 0, prompt: 0, completion: 0 },
        },
      });

      expect(result.pass).toBe(true);
    });

    it('should handle array from script for contains-all', async () => {
      const result = await runAssertion({
        assertion: {
          type: 'contains-all',
          value: 'file://rubric-generator.cjs:referenceArray',
        },
        test: { vars: {} },
        providerResponse: {
          output: 'This has reference one and also reference two in it',
          tokenUsage: { total: 0, prompt: 0, completion: 0 },
        },
      });

      expect(result.pass).toBe(true);
    });

    it('should allow colons in class or function names when parsing file names', async () => {
      const mockRunRuby = vi.mocked(runRuby);
      mockRunRuby.mockResolvedValue(true);

      const result = await runAssertion({
        assertion: {
          type: 'ruby',
          value: 'file://some_ruby_file.rb:MyModule::Nested.method',
        },
        test: { vars: {} },
        providerResponse: {
          output: 'namespaced result',
          tokenUsage: { total: 0, prompt: 0, completion: 0 },
        },
      });

      expect(mockRunRuby).toHaveBeenCalledWith(
        expect.stringContaining('some_ruby_file.rb'),
        'MyModule::Nested.method',
        expect.any(Array),
      );
      expect(result.pass).toBe(true);
    });

    it('should return fail result when runRuby throws for a namespaced method', async () => {
      const mockRunRuby = vi.mocked(runRuby);
      mockRunRuby.mockRejectedValue(new Error('Ruby execution error'));

      const result = await runAssertion({
        assertion: {
          type: 'ruby',
          value: 'file://some_ruby_file.rb:MyModule::Nested.method',
        },
        test: { vars: {} },
        providerResponse: {
          output: 'namespaced result',
          tokenUsage: { total: 0, prompt: 0, completion: 0 },
        },
      });

      expect(mockRunRuby).toHaveBeenCalledWith(
        expect.stringContaining('some_ruby_file.rb'),
        'MyModule::Nested.method',
        expect.any(Array),
      );
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('Ruby execution error');
    });
  });
});
