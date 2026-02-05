import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { importModule } from '../../src/esm';
import * as matchers from '../../src/matchers';

import type { ProviderResponse } from '../../src/types/index';

// Mock dependencies
vi.mock('../../src/redteam/remoteGeneration', () => ({
  shouldGenerateRemote: vi.fn().mockReturnValue(false),
}));

vi.mock('better-sqlite3');

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

vi.mock('../../src/matchers', async () => {
  const actual = await vi.importActual('../../src/matchers');
  return {
    ...actual,
    matchesLlmRubric: vi.fn().mockResolvedValue({ pass: true, score: 1, reason: 'Mocked' }),
    matchesFactuality: vi.fn().mockResolvedValue({ pass: true, score: 1, reason: 'Mocked' }),
    matchesClosedQa: vi.fn().mockResolvedValue({ pass: true, score: 1, reason: 'Mocked' }),
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
  });

  const baseProviderResponse: ProviderResponse = {
    output: 'test output',
    tokenUsage: { total: 0, prompt: 0, completion: 0 },
  };

  describe('llm-rubric with file:// script', () => {
    it('should pass script output to matchesLlmRubric', async () => {
      const { runAssertion } = await import('../../src/assertions/index');
      const mockMatchesLlmRubric = vi.mocked(matchers.matchesLlmRubric);
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
      const { runAssertion } = await import('../../src/assertions/index');
      const mockMatchesLlmRubric = vi.mocked(matchers.matchesLlmRubric);
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
      const { runAssertion } = await import('../../src/assertions/index');
      const mockMatchesLlmRubric = vi.mocked(matchers.matchesLlmRubric);
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
      const { runAssertion } = await import('../../src/assertions/index');

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
      const { runAssertion } = await import('../../src/assertions/index');

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
      const { runAssertion } = await import('../../src/assertions/index');

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

  describe('equals with file:// script', () => {
    it('should use script output for equals assertion', async () => {
      const { runAssertion } = await import('../../src/assertions/index');

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
      const { runAssertion } = await import('../../src/assertions/index');

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
      const { runAssertion } = await import('../../src/assertions/index');

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
      const { runAssertion } = await import('../../src/assertions/index');

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
      const { runAssertion } = await import('../../src/assertions/index');

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
      const { runAssertion } = await import('../../src/assertions/index');

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
      const { runAssertion } = await import('../../src/assertions/index');

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
      const { runAssertion } = await import('../../src/assertions/index');

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
      const { runAssertion } = await import('../../src/assertions/index');

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
      const { runAssertion } = await import('../../src/assertions/index');

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
      const { runAssertion } = await import('../../src/assertions/index');

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
  });
});
