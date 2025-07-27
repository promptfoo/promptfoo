import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import dedent from 'dedent';
import { z } from 'zod';
import { synthesizeFromTestSuite } from '../../../testCase/synthesis';
import type { TestSuite } from '../../../types';
import { createToolResponse } from '../lib/utils';
import { validateFilePath, validateProviderId } from '../lib/security';

/**
 * Tool to generate test datasets using AI
 */
export function registerGenerateDatasetTool(server: McpServer) {
  server.tool(
    'generate_dataset',
    {
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
          `,
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
          `,
        ),

      outputPath: z
        .string()
        .optional()
        .describe('Path to save the generated dataset (e.g., "datasets/test-cases.yaml")'),
    },
    async (args) => {
      const { prompt, instructions, numSamples = 10, provider, outputPath } = args;

      try {
        // Validate security constraints
        if (outputPath) {
          validateFilePath(outputPath);
        }

        if (provider) {
          validateProviderId(provider);
        }

        // Create a minimal test suite for dataset generation
        const testSuite: TestSuite = {
          prompts: [{ label: 'dataset-generation', raw: prompt }],
          providers: [],
          tests: [],
        };

        // Generate the dataset
        const results = await synthesizeFromTestSuite(testSuite, {
          instructions,
          numPersonas: 1,
          numTestCasesPerPersona: numSamples,
          provider,
        });

        if (!results || results.length === 0) {
          return createToolResponse(
            'generate_dataset',
            false,
            undefined,
            'Failed to generate dataset. No data returned.',
          );
        }

        // Format results as test cases
        const dataset = results.map((vars: any) => ({ vars }));

        // Save to file if outputPath is provided
        if (outputPath) {
          const fs = await import('fs');
          const yaml = await import('js-yaml');
          const yamlContent = yaml.dump({ tests: dataset });
          fs.writeFileSync(outputPath, yamlContent);
        }

        // Extract useful information from the result
        const summary = {
          totalGenerated: dataset.length,
          outputPath: outputPath || 'Not saved to file',
          provider: provider || 'default',
          prompt: prompt,
        };

        // Sample the first few items for preview
        const preview = dataset.slice(0, 3).map((item: any) => ({
          vars: item.vars,
        }));

        return createToolResponse('generate_dataset', true, {
          dataset,
          summary,
          preview,
          message: `Successfully generated ${dataset.length} test cases`,
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

        // Provide specific error guidance
        if (errorMessage.includes('provider')) {
          return createToolResponse(
            'generate_dataset',
            false,
            {
              originalError: errorMessage,
              suggestion: 'Check that the provider is properly configured with valid credentials',
            },
            'Failed to load AI provider for dataset generation',
          );
        }

        if (errorMessage.includes('rate limit')) {
          return createToolResponse(
            'generate_dataset',
            false,
            {
              originalError: errorMessage,
              suggestion: 'Try reducing numSamples or wait before retrying',
            },
            'Rate limit exceeded while generating dataset',
          );
        }

        return createToolResponse(
          'generate_dataset',
          false,
          undefined,
          `Failed to generate dataset: ${errorMessage}`,
        );
      }
    },
  );
}
