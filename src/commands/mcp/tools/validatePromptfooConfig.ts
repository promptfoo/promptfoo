import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import dedent from 'dedent';
import { z } from 'zod';
import { fromError } from 'zod-validation-error';
import { TestSuiteSchema, UnifiedConfigSchema } from '../../../types';
import { loadDefaultConfig } from '../../../util/config/default';
import { resolveConfigs } from '../../../util/config/load';
import { AbstractTool } from '../lib/baseTool';
import type { ToolResult, ValidationResults } from '../lib/types';

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
 * 
 * @example
 * // Validate default config
 * await validatePromptfooConfig({})
 * 
 * @example
 * // Validate specific config files
 * await validatePromptfooConfig({ 
 *   configPaths: ["config/eval.yaml", "config/prompts.yaml"] 
 * })
 */
export class ValidatePromptfooConfigTool extends AbstractTool {
  readonly name = 'validate_promptfoo_config';
  readonly description = 'Validate promptfoo configuration files before running evals';
  
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
  });

  protected async execute(args: unknown): Promise<ToolResult> {
    const { configPaths } = this.schema.parse(args);
    
    try {
      // Load default configuration
      let defaultConfig;
      try {
        const result = await loadDefaultConfig();
        defaultConfig = result.defaultConfig;
      } catch (error) {
        return this.error(
          'Failed to load default configuration. Ensure promptfoo is properly installed.',
          { 
            originalError: error instanceof Error ? error.message : 'Unknown error',
            suggestion: 'Run "npm install -g promptfoo" or check your installation'
          }
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
        const formattedError = fromError(configParse.error).message;
        validationResults.errors.push(`Configuration validation error: ${formattedError}`);
        validationResults.isValid = false;
      }

      // Validate test suite schema
      const suiteParse = TestSuiteSchema.safeParse(testSuite);
      if (suiteParse.success) {
        validationResults.testSuite = testSuite;
      } else {
        const formattedError = fromError(suiteParse.error).message;
        validationResults.errors.push(`Test suite validation error: ${formattedError}`);
        validationResults.isValid = false;
      }

      // Add helpful warnings and analysis
      if (configParse.success) {
        const analysis = this.analyzeConfiguration(config);
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
        
        return this.success({
          ...validationResults,
          summary,
        });
      }

      return validationResults.isValid 
        ? this.success(validationResults)
        : this.error('Configuration validation failed', validationResults);
        
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('ENOENT')) {
        return this.error(
          'Configuration file not found. Check the file path or create a new config.',
          { 
            providedPaths: configPaths,
            suggestion: 'Run "promptfoo init" to create a new configuration file'
          }
        );
      }
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.error(`Failed to validate configuration: ${errorMessage}`);
    }
  }
  
  private analyzeConfiguration(config: any) {
    const warnings: string[] = [];
    
    const promptCount = Array.isArray(config.prompts) ? config.prompts.length : 
                       config.prompts ? 1 : 0;
    const providerCount = Array.isArray(config.providers) ? config.providers.length : 
                         config.providers ? 1 : 0;
    const testCount = Array.isArray(config.tests) ? config.tests.length : 
                     config.tests ? 1 : 0;
    
    if (promptCount === 0) {
      warnings.push('No prompts defined - add prompts to evaluate model responses');
    }
    
    if (providerCount === 0) {
      warnings.push('No providers defined - add providers like "openai:gpt-4" to run evals');
    }
    
    if (testCount === 0) {
      warnings.push('No test cases defined - add test cases to validate model behavior');
    }
    
    const hasAssertions = config.tests && Array.isArray(config.tests) && 
                         config.tests.some((test: any) => test.assert && test.assert.length > 0);
    
    if (testCount > 0 && !hasAssertions) {
      warnings.push('No assertions defined in test cases - add assertions to validate outputs');
    }
    
    const totalEvaluations = promptCount * providerCount * testCount;
    
    if (promptCount > 0 && providerCount > 0 && testCount > 0) {
      warnings.push(
        `Configuration ready: ${promptCount} prompts × ${providerCount} providers × ${testCount} tests = ${totalEvaluations} total evals`
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
}

/**
 * Register the validate promptfoo config tool with the MCP server
 */
export function registerValidatePromptfooConfigTool(server: McpServer) {
  const tool = new ValidatePromptfooConfigTool();
  tool.register(server);
}
