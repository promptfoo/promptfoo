import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerGetEvaluationDetailsTool } from '../../../../src/commands/mcp/tools/getEvaluationDetails';
import { readResult } from '../../../../src/util/database';
import { createEvaluateResult, createEvaluateSummaryV2 } from '../../../factories/eval';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('../../../../src/util/database', () => ({
  readResult: vi.fn(),
}));

vi.mock('../../../../src/commands/mcp/lib/utils', () => ({
  createToolResponse: vi.fn((name, success, data) => ({ name, success, data })),
}));

describe('get_evaluation_details filtering', () => {
  function getMockEvalData(version = 4): NonNullable<Awaited<ReturnType<typeof readResult>>> {
    const summary = createEvaluateSummaryV2({
      results: [
        createEvaluateResult(),
        createEvaluateResult({ success: false, error: 'Failed assertion' }),
        createEvaluateResult({
          success: false,
          error: 'Runtime error',
          metadata: { starred: true },
        }),
        createEvaluateResult({ error: 'Nonfatal error', metadata: { highlighted: true } }),
      ],
    });
    const { timestamp, results, stats, table } = summary;
    return {
      id: 'test-eval',
      createdAt: new Date(timestamp),
      result: {
        author: null,
        config: {},
        createdAt: timestamp,
        version,
        prompts: table.head.prompts,
        results:
          version === 3
            ? summary
            : { version: 3, timestamp, results, stats, prompts: table.head.prompts },
      },
    };
  }

  let toolHandler: (args: { id: string; filter: string }) => Promise<any>;

  beforeEach(() => {
    vi.clearAllMocks();
    const tool = vi.fn();
    registerGetEvaluationDetailsTool({ tool } as unknown as McpServer);
    expect(tool).toHaveBeenCalledTimes(1);
    toolHandler = tool.mock.calls[0][2];
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe.each([3, 4])('persisted evaluation v%i', (version) => {
    it.each([
      ['all', [0, 1, 2, 3]],
      ['passes', [0]],
      ['failures', [1, 2]],
      ['errors', [1, 2, 3]],
      ['highlights', [2, 3]],
    ] as const)('filters %s and keeps the original summary', async (filter, expectedIndices) => {
      const stored = getMockEvalData(version);
      const rows = stored.result.results.results;
      vi.mocked(readResult).mockResolvedValue(stored);

      const response = await toolHandler({ id: stored.id, filter });

      expect(response.success).toBe(true);
      expect(response.data.evaluation.results.results).toEqual(expectedIndices.map((i) => rows[i]));
      expect(response.data.summary).toEqual({
        id: stored.id,
        totalTests: 4,
        passedTests: 2,
        failedTests: 2,
        providers: [],
        prompts: 0,
      });
    });
  });

  it.each([undefined, { invalid: true }])('preserves malformed legacy rows', async (rows) => {
    const stored = getMockEvalData(3);
    Object.assign(stored.result.results, { results: rows });
    vi.mocked(readResult).mockResolvedValue(stored);

    const response = await toolHandler({ id: stored.id, filter: 'failures' });

    expect(response.success).toBe(true);
    expect(response.data.evaluation.results.results).toEqual(rows);
    expect(response.data.summary).toMatchObject({ totalTests: 0, passedTests: 0, failedTests: 0 });
  });

  it('redacts Azure Blob SAS tokens from returned evaluation config', async () => {
    const sasUri = 'az://account/container/tests.yaml?sp=r&sig=azure-secret';
    const storedEvaluation = getMockEvalData();
    storedEvaluation.result.config = { tests: sasUri };
    vi.mocked(readResult).mockResolvedValue(storedEvaluation);

    const response = await toolHandler({ id: 'test-eval', filter: 'all' });

    expect(response.data.evaluation.config.tests).toBe(
      'az://account/container/tests.yaml?sp=r&sig=%5BREDACTED%5D',
    );
    expect(storedEvaluation.result.config.tests).toBe(sasUri);
  });
});
