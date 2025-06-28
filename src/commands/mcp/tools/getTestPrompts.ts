import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import dedent from 'dedent';
import { z } from 'zod';
import { getPromptsForTestCasesHash } from '../../../util/database';
import { createToolResponse } from '../utils';

/**
 * Get prompts and templates associated with a specific test case
 *
 * Use this tool to:
 * - Retrieve prompt templates used in testing
 * - Analyze prompt variations across test cases
 * - Debug prompt-related issues
 * - Extract reusable prompt patterns
 */
export function registerGetTestPromptsTool(server: McpServer) {
  server.tool(
    'get_test_prompts',
    {
      sha256hash: z
        .string()
        .min(1, 'Hash cannot be empty')
        .length(64, 'Must be a valid SHA256 hash (64 characters)')
        .describe(
          dedent`
            SHA256 hash of the test case. 
            Example: "a1b2c3d4e5f6..." 
            Obtain from evaluation results.
          `,
        ),
    },
    async ({ sha256hash }) => {
      try {
        const prompts = await getPromptsForTestCasesHash(sha256hash);
        return createToolResponse('get_test_prompts', true, prompts);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return createToolResponse('get_test_prompts', false, undefined, errorMessage);
      }
    },
  );
}
