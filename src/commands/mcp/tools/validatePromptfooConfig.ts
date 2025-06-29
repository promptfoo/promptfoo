import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import dedent from 'dedent';
import { z } from 'zod';
import { fromError } from 'zod-validation-error';
import { TestSuiteSchema, UnifiedConfigSchema } from '../../../types';
import { loadDefaultConfig } from '../../../util/config/default';
import { resolveConfigs } from '../../../util/config/load';
import type { ValidationResults } from '../types';
import { createToolResponse } from '../utils';

/**
 * Validate promptfoo configuration files before running evals
 *
 * Use this tool to:
 * - Catch configuration errors before eval runs
 * - Validate YAML/JSON syntax and schema compliance
 * - Check provider configurations and credentials
 * - Verify prompt and test case definitions
 * - Ensure all required fields are present
 *
 * This uses the same validation logic as `promptfoo validate` command.
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
    async ({ configPaths }) => {
      try {
        let defaultConfig;
        try {
          const result = await loadDefaultConfig();
          defaultConfig = result.defaultConfig;
        } catch (error) {
          return createToolResponse(
            'validate_promptfoo_config',
            false,
            undefined,
            `Failed to load default config: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
          validationResults.errors.push(
            `Configuration validation error: ${fromError(configParse.error).message}`,
          );
          validationResults.isValid = false;
        }

        // Validate test suite schema
        const suiteParse = TestSuiteSchema.safeParse(testSuite);
        if (suiteParse.success) {
          validationResults.testSuite = testSuite;
        } else {
          validationResults.errors.push(
            `Test suite validation error: ${fromError(suiteParse.error).message}`,
          );
          validationResults.isValid = false;
        }

        // Add helpful warnings for common issues
        if (configParse.success) {
          if (!config.prompts || (Array.isArray(config.prompts) && config.prompts.length === 0)) {
            validationResults.warnings.push(
              'No prompts defined - add prompts to evaluate model responses',
            );
          }

          if (
            !config.providers ||
            (Array.isArray(config.providers) && config.providers.length === 0)
          ) {
            validationResults.warnings.push(
              'No providers defined - add providers like "openai:gpt-4" to run evals',
            );
          }

          if (!config.tests || (Array.isArray(config.tests) && config.tests.length === 0)) {
            validationResults.warnings.push(
              'No test cases defined - add test cases to validate model behavior',
            );
          }

          if (config.prompts && config.providers && config.tests) {
            const promptCount = Array.isArray(config.prompts) ? config.prompts.length : 1;
            const providerCount = Array.isArray(config.providers) ? config.providers.length : 1;
            const testCount = Array.isArray(config.tests) ? config.tests.length : 1;
            const totalEvals = promptCount * providerCount * testCount;

            validationResults.warnings.push(
              `Configuration ready: ${promptCount} prompts × ${providerCount} providers × ${testCount} tests = ${totalEvals} total evals`,
            );
          }
        }

        return createToolResponse(
          'validate_promptfoo_config',
          validationResults.isValid,
          validationResults,
        );
      } catch (error: unknown) {
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
