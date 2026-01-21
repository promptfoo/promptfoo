import dedent from 'dedent';
import { z } from 'zod';
import { TestSuiteSchema, UnifiedConfigSchema } from '../../../types/index';
import { loadDefaultConfig } from '../../../util/config/default';
import { resolveConfigs } from '../../../util/config/load';
import { createToolResponse } from '../lib/utils';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { TestCase, TestSuite, UnifiedConfig } from '../../../types/index';

interface ValidationResults {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  config?: Partial<UnifiedConfig>;
  testSuite?: Partial<TestSuite>;
}

/**
 * Tool to validate promptfoo configuration files
 */
export function registerValidatePromptfooConfigTool(server: McpServer) {
  server.tool(
    'validate_promptfoo_config',
    {
      configPaths: z
        .array(z.string().min(1, 'Config path cannot be empty'))
        .optional()
        .describe(
          dedent`
            Paths to configuration files to validate.
            Examples: ["promptfooconfig.yaml"], ["config/eval.yaml", "config/prompts.yaml"].
            Defaults to "promptfooconfig.yaml" in current directory.
          `,
        ),
    },
    async (args) => {
      const { configPaths } = args;

      try {
        // Load default configuration
        let defaultConfig;
        try {
          const result = await loadDefaultConfig();
          defaultConfig = result.defaultConfig;
        } catch (error) {
          return createToolResponse(
            'validate_promptfoo_config',
            false,
            {
              originalError: error instanceof Error ? error.message : 'Unknown error',
              suggestion: 'Run "npm install -g promptfoo" or check your installation',
            },
            'Failed to load default configuration. Ensure promptfoo is properly installed.',
          );
        }

        // Use the same logic as the validate command
        const configPathsArray =
          configPaths || (process.cwd() ? ['promptfooconfig.yaml'] : undefined);

        const { config, testSuite } = await resolveConfigs(
          { config: configPathsArray },
          defaultConfig,
        );

        const validationResults: ValidationResults = {
          isValid: true,
          errors: [],
          warnings: [],
        };

        // Validate config schema
        const configParse = UnifiedConfigSchema.safeParse(config);
        if (configParse.success) {
          validationResults.config = config;
        } else {
          const formattedError = z.prettifyError(configParse.error);
          validationResults.errors.push(`Configuration validation error: ${formattedError}`);
          validationResults.isValid = false;
        }

        // Validate test suite schema
        const suiteParse = TestSuiteSchema.safeParse(testSuite);
        if (suiteParse.success) {
          validationResults.testSuite = testSuite;
        } else {
          const formattedError = z.prettifyError(suiteParse.error);
          validationResults.errors.push(`Test suite validation error: ${formattedError}`);
          validationResults.isValid = false;
        }

        // Add helpful warnings and analysis
        if (configParse.success) {
          const analysis = analyzeConfiguration(config);
          validationResults.warnings.push(...analysis.warnings);

          // Add summary information
          const summary = {
            promptCount: analysis.promptCount,
            providerCount: analysis.providerCount,
            testCount: analysis.testCount,
            totalEvaluations: analysis.totalEvaluations,
            hasAssertions: analysis.hasAssertions,
            configFiles: configPathsArray,
          };

          return createToolResponse('validate_promptfoo_config', true, {
            ...validationResults,
            summary,
          });
        }

        return validationResults.isValid
          ? createToolResponse('validate_promptfoo_config', true, validationResults)
          : createToolResponse(
              'validate_promptfoo_config',
              false,
              validationResults,
              'Configuration validation failed',
            );
      } catch (error: unknown) {
        if (error instanceof Error && error.message.includes('ENOENT')) {
          return createToolResponse(
            'validate_promptfoo_config',
            false,
            {
              providedPaths: configPaths,
              suggestion: 'Run "promptfoo init" to create a new configuration file',
            },
            'Configuration file not found. Check the file path or create a new config.',
          );
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return createToolResponse(
          'validate_promptfoo_config',
          false,
          undefined,
          `Failed to validate configuration: ${errorMessage}`,
        );
      }
    },
  );
}

interface ConfigurationAnalysis {
  warnings: string[];
  promptCount: number;
  providerCount: number;
  testCount: number;
  totalEvaluations: number;
  hasAssertions: boolean;
}

function analyzeConfiguration(config: Partial<UnifiedConfig>): ConfigurationAnalysis {
  const warnings: string[] = [];

  const promptCount = Array.isArray(config.prompts)
    ? config.prompts.length
    : config.prompts
      ? 1
      : 0;
  const providerCount = Array.isArray(config.providers)
    ? config.providers.length
    : config.providers
      ? 1
      : 0;
  const testCount = Array.isArray(config.tests) ? config.tests.length : config.tests ? 1 : 0;

  if (promptCount === 0) {
    warnings.push('No prompts defined - add prompts to evaluate model responses');
  }

  if (providerCount === 0) {
    warnings.push('No providers defined - add providers like "openai:gpt-4" to run evals');
  }

  if (testCount === 0) {
    warnings.push('No test cases defined - add test cases to validate model behavior');
  }

  const hasAssertions: boolean = Boolean(
    config.tests &&
      Array.isArray(config.tests) &&
      config.tests.some((test): test is TestCase => {
        return (
          typeof test === 'object' &&
          test !== null &&
          'assert' in test &&
          Array.isArray(test.assert) &&
          test.assert.length > 0
        );
      }),
  );

  if (testCount > 0 && !hasAssertions) {
    warnings.push('No assertions defined in test cases - add assertions to validate outputs');
  }

  const totalEvaluations = promptCount * providerCount * testCount;

  if (promptCount > 0 && providerCount > 0 && testCount > 0) {
    warnings.push(
      `Configuration ready: ${promptCount} prompts × ${providerCount} providers × ${testCount} tests = ${totalEvaluations} total evals`,
    );
  }

  return {
    warnings,
    promptCount,
    providerCount,
    testCount,
    totalEvaluations,
    hasAssertions,
  };
}
