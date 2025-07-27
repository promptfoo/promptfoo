import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import dedent from 'dedent';
import { z } from 'zod';
import { generateDataset } from '../../../dataset';
import { AbstractTool } from '../lib/baseTool';
import type { ToolResult } from '../lib/types';
import { validateFilePath, validateProviderId } from '../lib/security';

/**
 * Generate test datasets using AI for comprehensive evaluation coverage
 *
 * Use this tool to:
 * - Create diverse test cases automatically
 * - Generate edge cases and corner cases
 * - Build datasets for specific testing scenarios
 * - Save time on manual test case creation
 * - Ensure comprehensive test coverage
 * 
 * @example
 * // Generate a basic dataset
 * await generateDataset({
 *   prompt: "Generate test cases for a chatbot",
 *   numSamples: 10
 * })
 * 
 * @example
 * // Generate with specific instructions
 * await generateDataset({
 *   prompt: "Create test cases for email validation",
 *   instructions: "Include edge cases like special characters, international domains",
 *   numSamples: 20,
 *   provider: "openai:gpt-4o"
 * })
 */
export class GenerateDatasetTool extends AbstractTool {
  readonly name = 'generate_dataset';
  readonly description = 'Generate test datasets using AI for comprehensive evaluation coverage';
  
  protected readonly schema = z.object({
    prompt: z
      .string()
      .min(1, 'Prompt cannot be empty')
      .describe('The prompt or description of what kind of test cases to generate'),
    
    instructions: z
      .string()
      .optional()
      .describe(
        dedent`
          Additional instructions for dataset generation.
          Examples: "Include edge cases", "Focus on error scenarios", 
          "Generate diverse international examples"
        `
      ),
    
    numSamples: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(10)
      .describe('Number of test samples to generate (1-100)'),
    
    provider: z
      .string()
      .optional()
      .describe(
        dedent`
          AI provider to use for generation.
          Examples: "openai:gpt-4o", "anthropic:claude-3-sonnet"
          Defaults to configured default provider.
        `
      ),
      
    outputPath: z
      .string()
      .optional()
      .describe('Path to save the generated dataset (e.g., "datasets/test-cases.yaml")'),
  });

  protected async execute(args: unknown): Promise<ToolResult> {
    const { prompt, instructions, numSamples, provider, outputPath } = this.schema.parse(args);
    
    try {
      // Validate security constraints
      if (outputPath) {
        validateFilePath(outputPath);
      }
      
      if (provider) {
        validateProviderId(provider);
      }
      
      // Combine prompt with instructions
      const fullPrompt = instructions 
        ? `${prompt}\n\nAdditional instructions: ${instructions}`
        : prompt;
      
      // Generate the dataset
      const result = await generateDataset(
        fullPrompt,
        undefined, // tests (will be generated)
        {
          numSamples,
          provider,
          output: outputPath,
        }
      );
      
      if (!result || !result.dataset) {
        return this.error('Failed to generate dataset. No data returned.');
      }
      
      // Extract useful information from the result
      const summary = {
        totalGenerated: result.dataset.length,
        outputPath: outputPath || 'Not saved to file',
        provider: provider || 'default',
        prompt: prompt,
      };
      
      // Sample the first few items for preview
      const preview = result.dataset.slice(0, 3).map((item: any) => ({
        vars: item.vars,
        description: item.description,
      }));
      
      return this.success({
        dataset: result.dataset,
        summary,
        preview,
        message: `Successfully generated ${result.dataset.length} test cases`,
      });
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      // Provide specific error guidance
      if (errorMessage.includes('provider')) {
        return this.error(
          'Failed to load AI provider for dataset generation',
          { 
            originalError: errorMessage,
            suggestion: 'Check that the provider is properly configured with valid credentials'
          }
        );
      }
      
      if (errorMessage.includes('rate limit')) {
        return this.error(
          'Rate limit exceeded while generating dataset',
          { 
            originalError: errorMessage,
            suggestion: 'Try reducing numSamples or wait before retrying'
          }
        );
      }
      
      return this.error(`Failed to generate dataset: ${errorMessage}`);
    }
  }
}

/**
 * Register the generate dataset tool with the MCP server
 */
export function registerGenerateDatasetTool(server: McpServer) {
  const tool = new GenerateDatasetTool();
  tool.register(server);
} 