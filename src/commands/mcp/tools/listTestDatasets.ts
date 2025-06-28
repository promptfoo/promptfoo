import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getTestCases } from '../../../util/database';
import { createToolResponse } from '../utils';

/**
 * Browse all available test datasets and their metadata
 *
 * Use this tool to:
 * - Discover available test datasets
 * - Understand test case structure
 * - Plan new evaluations
 * - Analyze test coverage
 */
export function registerListTestDatasetsTool(server: McpServer) {
  server.tool('list_test_datasets', {}, async () => {
    try {
      const datasets = await getTestCases();
      return createToolResponse('list_test_datasets', true, datasets);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return createToolResponse('list_test_datasets', false, undefined, errorMessage);
    }
  });
}
