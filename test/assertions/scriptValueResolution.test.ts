import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertion } from '../../src/assertions/index';
import cliState from '../../src/cliState';
import { importModule } from '../../src/esm';
import * as llmGradingMatchers from '../../src/matchers/llmGrading';
import { runPython } from '../../src/python/pythonUtils';
import { runRuby } from '../../src/ruby/rubyUtils.js';
import { sha256 } from '../../src/util/createHash';
import { maybeLoadConfigFromExternalFile } from '../../src/util/file';
import { mockProcessEnv } from '../util/utils';

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

vi.mock('../../src/python/pythonUtils', () => ({
  runPython: vi.fn(),
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

  describe('JSON schema assertions with file:// scripts', () => {
    it.each([
      ['is-json', 'booleanValue', '{"foo":"bar"}', true],
      ['not-is-json', 'booleanValue', '{"foo":"bar"}', false],
      ['contains-json', 'booleanValue', 'prefix {"foo":"bar"} suffix', true],
      ['not-contains-json', 'booleanValue', 'prefix {"foo":"bar"} suffix', false],
      ['is-json', 'falseValue', '{"foo":"bar"}', false],
      ['not-is-json', 'falseValue', '{"foo":"bar"}', true],
      ['contains-json', 'falseValue', 'prefix {"foo":"bar"} suffix', false],
      ['not-contains-json', 'falseValue', 'prefix {"foo":"bar"} suffix', true],
    ] as const)('uses the %s boolean schema returned by %s', async (type, exportName, output, pass) => {
      const result = await runAssertion({
        assertion: {
          type,
          value: `file://rubric-generator.cjs:${exportName}`,
        },
        test: { vars: {} },
        providerResponse: {
          output,
          tokenUsage: { total: 0, prompt: 0, completion: 0 },
        },
      });

      expect(result.pass).toBe(pass);
    });

    it('preserves rendered assertion metadata for string schema generators', async () => {
      const result = await runAssertion({
        assertion: {
          type: 'is-json',
          value: 'file://rubric-generator.cjs:knownValue',
        },
        test: { vars: {} },
        providerResponse: {
          output: '{}',
          tokenUsage: { total: 0, prompt: 0, completion: 0 },
        },
      });

      expect(result.metadata?.renderedAssertionValue).toBe('SCRIPT_OUTPUT_12345');
    });

    it.each([
      ['is-json', 'emptyValue', '{"foo":"bar"}'],
      ['not-is-json', 'emptyValue', '{"foo":"bar"}'],
      ['contains-json', 'emptyValue', 'prefix {"foo":"bar"} suffix'],
      ['not-contains-json', 'emptyValue', 'prefix {"foo":"bar"} suffix'],
      ['is-json', 'nullValue', '{"foo":"bar"}'],
      ['not-is-json', 'nullValue', '{"foo":"bar"}'],
      ['contains-json', 'nullValue', 'prefix {"foo":"bar"} suffix'],
      ['not-contains-json', 'nullValue', 'prefix {"foo":"bar"} suffix'],
      ['is-json', 'undefinedValue', '{"foo":"bar"}'],
      ['not-is-json', 'undefinedValue', '{"foo":"bar"}'],
      ['contains-json', 'undefinedValue', 'prefix {"foo":"bar"} suffix'],
      ['not-contains-json', 'undefinedValue', 'prefix {"foo":"bar"} suffix'],
    ] as const)('rejects the %s schema returned by %s', async (type, exportName, output) => {
      const result = await runAssertion({
        assertion: {
          type,
          value: `file://rubric-generator.cjs:${exportName}`,
        },
        test: { vars: {} },
        providerResponse: {
          output,
          tokenUsage: { total: 0, prompt: 0, completion: 0 },
        },
      });

      expect(result).toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringContaining('Invalid JSON schema:'),
      });
    });

    it.each([
      ['is-json', false, 'Expected output to be valid JSON'],
      ['not-is-json', true, 'Assertion passed'],
      ['contains-json', false, 'Expected output to contain valid JSON'],
      ['not-contains-json', true, 'Assertion passed'],
    ] as const)('keeps %s lazy when an invalid generated schema is unused', async (type, pass, reason) => {
      const result = await runAssertion({
        assertion: {
          type,
          value: 'file://rubric-generator.cjs:undefinedValue',
        },
        test: { vars: {} },
        providerResponse: {
          output: 'not JSON',
          tokenUsage: { total: 0, prompt: 0, completion: 0 },
        },
      });

      expect(result).toMatchObject({ pass, reason });
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

    it('should resolve a named Ruby JSON schema generator before and after serialization', async () => {
      const mockRunRuby = vi.mocked(runRuby);
      mockRunRuby.mockResolvedValue({ type: 'object' });
      const restoreEnv = mockProcessEnv({ PR8237_SCHEMA_PATH: '/private/schema/path' });

      try {
        const assertion = maybeLoadConfigFromExternalFile(
          {
            assert: [
              {
                type: 'is-json',
                value: 'file://{{ env.PR8237_SCHEMA_PATH }}/schema.rb:build_schema',
              },
            ],
          },
          'test-config',
        ).assert[0];

        const result = await runAssertion({
          assertion,
          test: { vars: {} },
          providerResponse: {
            output: '{}',
            tokenUsage: { total: 0, prompt: 0, completion: 0 },
          },
        });
        const persistedResult = await runAssertion({
          assertion: JSON.parse(JSON.stringify(assertion)),
          test: { vars: {} },
          providerResponse: {
            output: '{}',
            tokenUsage: { total: 0, prompt: 0, completion: 0 },
          },
        });

        expect(assertion.value).toContain('{{ env.PR8237_SCHEMA_PATH }}');
        expect(JSON.stringify(assertion)).not.toContain('/private/schema/path');
        expect(mockRunRuby).toHaveBeenCalledWith(
          path.resolve('/private/schema/path/schema.rb'),
          'build_schema',
          expect.any(Array),
          { redactScriptPath: true },
        );
        expect(mockRunRuby).toHaveBeenCalledTimes(2);
        expect(result).toMatchObject({ pass: true, score: 1, reason: 'Assertion passed' });
        expect(persistedResult).toMatchObject({ pass: true, score: 1, reason: 'Assertion passed' });
      } finally {
        restoreEnv();
      }
    });

    it('should resolve a persisted schema generator from config env', async () => {
      const mockRunRuby = vi.mocked(runRuby);
      mockRunRuby.mockResolvedValue({ type: 'object' });
      const restoreEnv = mockProcessEnv({ PR8237_CONFIG_SCHEMA_PATH: undefined });
      const originalConfig = cliState.config;
      cliState.config = {
        env: { PR8237_CONFIG_SCHEMA_PATH: '/private/config/schema/path' },
      };

      try {
        const result = await runAssertion({
          assertion: {
            type: 'is-json',
            value: 'file://{{ env.PR8237_CONFIG_SCHEMA_PATH }}/schema.rb:build_schema',
          },
          test: { vars: {} },
          providerResponse: {
            output: '{}',
            tokenUsage: { total: 0, prompt: 0, completion: 0 },
          },
        });

        expect(mockRunRuby).toHaveBeenCalledWith(
          path.resolve('/private/config/schema/path/schema.rb'),
          'build_schema',
          expect.any(Array),
          { redactScriptPath: true },
        );
        expect(result).toMatchObject({ pass: true, score: 1, reason: 'Assertion passed' });
      } finally {
        cliState.config = originalConfig;
        restoreEnv();
      }
    });

    it('should redact a private JavaScript schema generator path from execution errors', async () => {
      const privatePath = '/private/PR8237_JS_SCHEMA_PATH';
      const privateMethod = 'PR8237_SECRET_JS_METHOD';
      vi.mocked(importModule).mockRejectedValue(
        new Error(`Cannot load ${privatePath}/schema.cjs:${privateMethod}`),
      );
      const restoreEnv = mockProcessEnv({
        PR8237_JS_SCHEMA_REF: `${privatePath}/schema.cjs:${privateMethod}`,
      });

      try {
        const assertion = maybeLoadConfigFromExternalFile(
          {
            assert: [
              {
                type: 'is-json',
                value: 'file://{{ env.PR8237_JS_SCHEMA_REF }}',
              },
            ],
          },
          'test-config',
        ).assert[0];

        const error = await runAssertion({
          assertion,
          test: { vars: {} },
          providerResponse: { output: '{}', tokenUsage: { total: 0, prompt: 0, completion: 0 } },
        }).catch((error: unknown) => error);
        expect(error).toBeInstanceOf(Error);
        if (error instanceof Error) {
          expect(error.message).toContain('Cannot load');
          expect(error.message).toContain('[redacted schema generator path]');
          expect(error.message).not.toContain(privatePath);
          expect(error.message).not.toContain(privateMethod);
        }
        expect(importModule).toHaveBeenCalledWith(
          path.resolve(privatePath, 'schema.cjs'),
          privateMethod,
        );
      } finally {
        restoreEnv();
      }
    });

    it.each([
      ['Python', '.py', runPython],
      ['Ruby', '.rb', runRuby],
    ] as const)('should redact a private %s schema generator path from assertion failures', async (_language, extension, runner) => {
      const privatePath = `/private/PR8237_${extension.slice(1).toUpperCase()}_SCHEMA_PATH`;
      const privateMethod = `PR8237_SECRET_${extension.slice(1).toUpperCase()}_METHOD`;
      vi.mocked(runner).mockRejectedValue(
        new Error(`Generator failed at ${privatePath}/schema${extension}:${privateMethod}`),
      );
      const restoreEnv = mockProcessEnv({
        PR8237_LANGUAGE_SCHEMA_REF: `${privatePath}/schema${extension}:${privateMethod}`,
      });

      try {
        const result = await runAssertion({
          assertion: {
            type: 'is-json',
            value: 'file://{{ env.PR8237_LANGUAGE_SCHEMA_REF }}',
          },
          test: { vars: {} },
          providerResponse: { output: '{}', tokenUsage: { total: 0, prompt: 0, completion: 0 } },
        });

        expect(result).toMatchObject({
          pass: false,
          score: 0,
          reason: expect.stringContaining('Generator failed at'),
        });
        expect(result.reason).toContain('[redacted schema generator path]');
        expect(JSON.stringify(result)).not.toContain(privatePath);
        expect(JSON.stringify(result)).not.toContain(privateMethod);
        expect(runner).toHaveBeenCalledWith(
          path.resolve(privatePath, `schema${extension}`),
          privateMethod,
          expect.any(Array),
          { redactScriptPath: true },
        );
      } finally {
        restoreEnv();
      }
    });

    it('preserves JavaScript generator diagnostics for public schema paths', async () => {
      vi.mocked(importModule).mockRejectedValue(new Error('Public JavaScript generator error'));

      await expect(
        runAssertion({
          assertion: { type: 'is-json', value: 'file://schema.cjs:build_schema' },
          test: { vars: {} },
          providerResponse: { output: '{}', tokenUsage: { total: 0, prompt: 0, completion: 0 } },
        }),
      ).rejects.toThrow('Public JavaScript generator error');
      expect(importModule).toHaveBeenCalledWith(
        path.resolve(cliState.basePath || '', 'schema.cjs'),
        'build_schema',
      );
    });

    it.each([
      ['Python', '.py', runPython],
      ['Ruby', '.rb', runRuby],
    ] as const)('preserves %s generator diagnostics for public schema paths', async (language, extension, runner) => {
      const diagnostic = `Public ${language} generator error`;
      vi.mocked(runner).mockRejectedValue(new Error(diagnostic));

      const result = await runAssertion({
        assertion: { type: 'is-json', value: `file://schema${extension}:build_schema` },
        test: { vars: {} },
        providerResponse: { output: '{}', tokenUsage: { total: 0, prompt: 0, completion: 0 } },
      });

      expect(result.reason).toBe(diagnostic);
      expect(runner).toHaveBeenCalledWith(
        path.resolve(cliState.basePath || '', `schema${extension}`),
        'build_schema',
        expect.any(Array),
      );
    });

    it('should not execute a generator when a persisted schema file error is present', async () => {
      const mockRunRuby = vi.mocked(runRuby);
      mockRunRuby.mockResolvedValue({ type: 'object' });
      const restoreEnv = mockProcessEnv({
        PR8237_SWITCHED_SCHEMA_PATH: '/private/switched/schema/path',
      });
      const assertion = {
        type: 'is-json' as const,
        value: 'file://{{ env.PR8237_SWITCHED_SCHEMA_PATH }}/schema.rb:build_schema',
        __promptfooJsonSchemaFileError: {
          error: 'schema file not found',
          fingerprint: `sha256:${'a'.repeat(64)}`,
          valueFingerprint: `sha256:${sha256(
            'file://{{ env.PR8237_SWITCHED_SCHEMA_PATH }}/schema.rb:build_schema',
          )}`,
        },
      };

      try {
        const result = await runAssertion({
          assertion,
          test: { vars: {} },
          providerResponse: {
            output: '{}',
            tokenUsage: { total: 0, prompt: 0, completion: 0 },
          },
        });
        const lazyResult = await runAssertion({
          assertion: { ...assertion, type: 'not-contains-json' },
          test: { vars: {} },
          providerResponse: {
            output: 'no JSON here',
            tokenUsage: { total: 0, prompt: 0, completion: 0 },
          },
        });

        expect(mockRunRuby).not.toHaveBeenCalled();
        expect(result).toMatchObject({
          pass: false,
          score: 0,
          reason: 'Invalid JSON schema: schema file not found',
        });
        expect(lazyResult).toMatchObject({ pass: true, reason: 'Assertion passed' });
      } finally {
        restoreEnv();
      }
    });

    it('should render live and serialized schema generator paths exactly once', async () => {
      const mockRunRuby = vi.mocked(runRuby);
      mockRunRuby.mockResolvedValue({ type: 'object' });
      const restoreEnv = mockProcessEnv({
        PR8237_FIRST_SCHEMA_PATH: '{{ env.PR8237_SECOND_SCHEMA_PATH }}',
        PR8237_SECOND_SCHEMA_PATH: '/private/second/schema/path',
      });

      try {
        const assertion = maybeLoadConfigFromExternalFile(
          {
            assert: [
              {
                type: 'is-json',
                value: 'file://{{ env.PR8237_FIRST_SCHEMA_PATH }}/schema.rb:build_schema',
              },
            ],
          },
          'test-config',
        ).assert[0];

        for (const candidate of [assertion, JSON.parse(JSON.stringify(assertion))]) {
          const result = await runAssertion({
            assertion: candidate,
            test: { vars: {} },
            providerResponse: {
              output: '{}',
              tokenUsage: { total: 0, prompt: 0, completion: 0 },
            },
          });
          expect(result).toMatchObject({ pass: true, reason: 'Assertion passed' });
        }

        expect(mockRunRuby).toHaveBeenCalledTimes(2);
        for (const [filePath] of mockRunRuby.mock.calls) {
          const normalizedFilePath = filePath.replaceAll('\\', '/');
          expect(normalizedFilePath).toContain('{{ env.PR8237_SECOND_SCHEMA_PATH }}');
          expect(normalizedFilePath).not.toContain('/private/second/schema/path');
        }
      } finally {
        restoreEnv();
      }
    });
  });
});
