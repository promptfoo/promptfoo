import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerListEvaluationsTool } from '../../../../src/commands/mcp/tools/listEvaluations';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const getEvalSummaries = vi.hoisted(() => vi.fn());

vi.mock('../../../../src/models/eval', () => ({ getEvalSummaries }));

function getHandler() {
  let handler: ((args: Record<string, unknown>) => Promise<any>) | undefined;
  const server = {
    tool: vi.fn((_name, _schema, registeredHandler) => {
      handler = registeredHandler;
    }),
  };

  registerListEvaluationsTool(server as unknown as McpServer);
  return handler!;
}

describe('list_evaluations MCP tool', () => {
  beforeEach(() => {
    getEvalSummaries.mockReset();
  });

  it('reads current evaluation summaries on every request', async () => {
    const earlier = { evalId: 'earlier', createdAt: Date.now() };
    const latest = { evalId: 'latest', createdAt: Date.now() };
    getEvalSummaries.mockResolvedValueOnce([earlier]).mockResolvedValueOnce([latest, earlier]);
    const handler = getHandler();

    await handler({ page: 1, pageSize: 20 });
    const result = await handler({ page: 1, pageSize: 20 });
    const response = JSON.parse(result.content[0].text);

    expect(getEvalSummaries).toHaveBeenCalledTimes(2);
    expect(response.data.evaluations.map(({ evalId }: { evalId: string }) => evalId)).toEqual([
      'latest',
      'earlier',
    ]);
    expect(response.data.summary).not.toHaveProperty('cacheStats');
  });

  it('preserves dataset filtering and pagination', async () => {
    getEvalSummaries.mockResolvedValue([
      { evalId: 'first', createdAt: Date.now() },
      { evalId: 'second', createdAt: Date.now() },
      { evalId: 'third', createdAt: Date.now() },
    ]);
    const handler = getHandler();

    const result = await handler({ datasetId: 'dataset-1', page: 2, pageSize: 2 });
    const response = JSON.parse(result.content[0].text);

    expect(getEvalSummaries).toHaveBeenCalledWith('dataset-1');
    expect(response.data.evaluations).toEqual([expect.objectContaining({ evalId: 'third' })]);
    expect(response.data.pagination).toEqual({
      page: 2,
      pageSize: 2,
      totalItems: 3,
      totalPages: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    });
    expect(response.data.summary.datasetId).toBe('dataset-1');
  });
});
