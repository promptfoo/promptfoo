import dedent from 'dedent';
import { z } from 'zod';
import { fromError } from 'zod-validation-error';
import { TestSuiteSchema, UnifiedConfigSchema } from '../../../../types';
import { loadDefaultConfig } from '../../../../util/config/default';
import { resolveConfigs } from '../../../../util/config/load';
import { AbstractTool, ConfigurationError } from '../../lib';
import type { ConfigValidationOptions, ToolResult, ValidationResults } from '../../lib/types';

/**
 * Validate promptfoo configuration files before running evaluations
 *
 * Use this tool to:
 * - Catch configuration errors before evaluation runs
 * - Validate YAML/JSON syntax and schema compliance
 * - Check provider configurations and credentials
 * - Verify prompt and test case definitions
 * - Ensure all required fields are present
 *
 * This uses the same validation logic as `promptfoo validate` command.
 */
export class ValidateConfigTool extends AbstractTool {
  readonly name = 'validate_promptfoo_config';
  readonly description =
    'Validate promptfoo configuration files using the same logic as CLI validate';

  protected readonly schema = z.object({
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
    strict: z.boolean().optional().default(false).describe('Enable strict validation mode'),
  });

  protected async execute(args: ConfigValidationOptions): Promise<ToolResult<ValidationResults>> {
    try {
      // Load default configuration
      let defaultConfig;
      try {
        const result = await loadDefaultConfig();
        defaultConfig = result.defaultConfig;
      } catch (error) {
        throw new ConfigurationError(
          `Failed to load default config: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }

      // Use the same logic as the validate command
      const configPathsArray = args.configPaths || ['promptfooconfig.yaml'];

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
        this.addConfigWarnings(config, validationResults);
      }

      return this.success(validationResults);
    } catch (error) {
      if (error instanceof ConfigurationError) {
        throw error;
      }
      throw new ConfigurationError(
        `Failed to validate configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
        args.configPaths?.[0],
      );
    }
  }

  private addConfigWarnings(config: any, results: ValidationResults): void {
    if (!config.prompts || (Array.isArray(config.prompts) && config.prompts.length === 0)) {
      results.warnings.push('No prompts defined - add prompts to evaluate model responses');
    }

    if (!config.providers || (Array.isArray(config.providers) && config.providers.length === 0)) {
      results.warnings.push(
        'No providers defined - add providers like "openai:gpt-4" to run evaluations',
      );
    }

    if (!config.tests || (Array.isArray(config.tests) && config.tests.length === 0)) {
      results.warnings.push('No test cases defined - add test cases to validate model behavior');
    }

    if (config.prompts && config.providers && config.tests) {
      const promptCount = Array.isArray(config.prompts) ? config.prompts.length : 1;
      const providerCount = Array.isArray(config.providers) ? config.providers.length : 1;
      const testCount = Array.isArray(config.tests) ? config.tests.length : 1;
      const totalEvals = promptCount * providerCount * testCount;

      results.warnings.push(
        `Configuration ready: ${promptCount} prompts × ${providerCount} providers × ${testCount} tests = ${totalEvals} total evaluations`,
      );
    }
  }
}
