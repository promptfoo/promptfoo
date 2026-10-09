import { randomUUID } from 'node:crypto';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerListEvaluationsTool } from '../../../../src/commands/mcp/tools/listEvaluations';
import { runDbMigrations } from '../../../../src/migrate';
import Eval, { getEvalSummaries } from '../../../../src/models/eval';

describe('list_evaluations in a long-lived MCP session', () => {
  let server: McpServer;
  let client: Client;
  const created: Eval[] = [];

  beforeAll(async () => {
    await runDbMigrations();
  });
  beforeEach(async () => {
    server = new McpServer({ name: 'list-evaluations-test', version: '1.0.0' });
    registerListEvaluationsTool(server);
    client = new Client({ name: 'list-evaluations-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });
  afterEach(async () => {
    await client.close();
    await server.close();
    for (const eval_ of created.splice(0)) {
      await eval_.delete();
    }
  });

  async function create(description: string, marker = randomUUID()) {
    const eval_ = await Eval.create(
      { description, providers: ['echo'], prompts: ['hello'], tests: [{ vars: { marker } }] },
      [{ raw: 'hello', label: 'hello' }],
    );
    created.push(eval_);
    const summary = (await getEvalSummaries()).find((entry) => entry.evalId === eval_.id);
    expect(summary?.datasetId).toBeTruthy();
    return { eval_, datasetId: summary!.datasetId!, marker };
  }

  async function list(args: { datasetId?: string; page?: number; pageSize?: number } = {}) {
    const result = await client.callTool({ name: 'list_evaluations', arguments: args });
    expect(result.isError).toBe(false);
    const content = result.content as { type: string; text: string }[];
    expect(content[0].type).toBe('text');
    const response = JSON.parse(content[0].text);
    expect(response).toMatchObject({
      tool: 'list_evaluations',
      success: true,
      timestamp: expect.any(String),
    });
    return response.data;
  }

  it('sees evaluations created after an empty listing', async () => {
    expect((await list()).summary.totalCount).toBe(0);
    const { eval_ } = await create('new evaluation');
    const result = await list();
    expect(result.evaluations.map((entry: { evalId: string }) => entry.evalId)).toEqual([eval_.id]);
    expect(result.summary.totalCount).toBe(1);
  });

  it('sees saved descriptions without restarting the session', async () => {
    const { eval_, datasetId } = await create('before');
    expect((await list({ datasetId })).evaluations[0].description).toBe('before');
    eval_.config.description = 'after';
    await eval_.save();
    expect((await list({ datasetId })).evaluations[0].description).toBe('after');
  });

  it('does not return deleted evaluations', async () => {
    const { eval_, datasetId } = await create('deleted');
    expect((await list({ datasetId })).summary.totalCount).toBe(1);
    await eval_.delete();
    const result = await list({ datasetId });
    expect(result.evaluations).toEqual([]);
    expect(result.summary.totalCount).toBe(0);
    expect(result.pagination.totalPages).toBe(0);
  });

  it('refreshes dataset-filtered pagination after another evaluation is saved', async () => {
    const { datasetId, marker } = await create('first');
    expect((await list({ datasetId })).summary.totalCount).toBe(1);
    await create('second', marker);
    await create('other dataset');
    const page1 = await list({ datasetId, pageSize: 1, page: 1 });
    const page2 = await list({ datasetId, pageSize: 1, page: 2 });
    expect(page1.summary.totalCount).toBe(2);
    expect(page1.pagination).toMatchObject({
      page: 1,
      pageSize: 1,
      totalItems: 2,
      totalPages: 2,
      hasNextPage: true,
      hasPreviousPage: false,
    });
    expect(page2.pagination).toMatchObject({
      page: 2,
      totalItems: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    });
    expect(
      [...page1.evaluations, ...page2.evaluations]
        .map((entry: { description: string }) => entry.description)
        .sort(),
    ).toEqual(['first', 'second']);
  });

  it('retains the cacheStats response shape while keeping no transport cache', async () => {
    const { datasetId } = await create('stats');
    expect((await list({ datasetId })).summary.cacheStats).toEqual({ size: 0, calculatedSize: 0 });
    expect((await list({ datasetId })).summary.cacheStats).toEqual({ size: 0, calculatedSize: 0 });
  });
});
