import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerGetEvaluationDetailsTool } from '../../../../src/commands/mcp/tools/getEvaluationDetails';
import { readResult } from '../../../../src/util/database';

vi.mock('../../../../src/util/database', () => ({
  readResult: vi.fn(),
}));

vi.mock('../../../../src/commands/mcp/lib/utils', () => ({
  createToolResponse: vi.fn((name, success, data) => ({ name, success, data })),
}));

describe('get_evaluation_details filtering', () => {
  const getMockEvalData = () => ({
    result: {
      results: [
        { success: true, error: null, metadata: {} },
        { success: false, error: 'Failed assertion', metadata: {} },
        { success: false, error: 'Runtime error', metadata: {} },
        { success: true, error: null, metadata: { highlighted: true } },
      ],
      table: {
        head: {
          providers: [],
          prompts: [{}, {}],
        },
      },
    },
  });

  const mockMcpServer = {
    tool: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should filter failures correctly', async () => {
    registerGetEvaluationDetailsTool(mockMcpServer);
    const toolHandler = mockMcpServer.tool.mock.calls[0][2];
    vi.mocked(readResult).mockResolvedValue(getMockEvalData() as any);

    const response = await toolHandler({ id: 'test-eval', filter: 'failures' });

    expect(response.success).toBe(true);
    const filteredResults = response.data.evaluation.results;
    expect(filteredResults).toHaveLength(2);
    expect(filteredResults[0].success).toBe(false);
  });

  it('should filter passes correctly', async () => {
    registerGetEvaluationDetailsTool(mockMcpServer);
    const toolHandler = mockMcpServer.tool.mock.calls[0][2];
    vi.mocked(readResult).mockResolvedValue(getMockEvalData() as any);

    const response = await toolHandler({ id: 'test-eval', filter: 'passes' });

    expect(response.success).toBe(true);
    const filteredResults = response.data.evaluation.results;
    expect(filteredResults).toHaveLength(2);
    filteredResults.forEach((r: any) => {
      expect(r.success).toBe(true);
      expect(r.error).toBeNull();
    });
  });

  it('should filter errors correctly', async () => {
    registerGetEvaluationDetailsTool(mockMcpServer);
    const toolHandler = mockMcpServer.tool.mock.calls[0][2];
    vi.mocked(readResult).mockResolvedValue(getMockEvalData() as any);

    const response = await toolHandler({ id: 'test-eval', filter: 'errors' });

    expect(response.success).toBe(true);
    const filteredResults = response.data.evaluation.results;
    expect(filteredResults).toHaveLength(2);
    expect(filteredResults[1].error).toBe('Runtime error');
  });

  it('should filter highlights correctly', async () => {
    registerGetEvaluationDetailsTool(mockMcpServer);
    const toolHandler = mockMcpServer.tool.mock.calls[0][2];
    vi.mocked(readResult).mockResolvedValue(getMockEvalData() as any);

    const response = await toolHandler({ id: 'test-eval', filter: 'highlights' });

    expect(response.success).toBe(true);
    const filteredResults = response.data.evaluation.results;
    expect(filteredResults).toHaveLength(1);
    expect(filteredResults[0].metadata.highlighted).toBe(true);
  });

  it('should return all results when filter is "all"', async () => {
    registerGetEvaluationDetailsTool(mockMcpServer);
    const toolHandler = mockMcpServer.tool.mock.calls[0][2];
    vi.mocked(readResult).mockResolvedValue(getMockEvalData() as any);

    const response = await toolHandler({ id: 'test-eval', filter: 'all' });

    expect(response.success).toBe(true);
    expect(response.data.evaluation.results).toHaveLength(4);
  });
});
