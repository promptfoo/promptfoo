import { parse } from 'csv-parse/sync';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Eval from '../../../src/models/eval';
import { evalRouter } from '../../../src/server/routes/eval';
import { EVAL_TABLE_MAX_PAGE_SIZE } from '../../../src/types/api/eval';
import { createCompletedPrompt, createEvaluateTableOutput } from '../../factories/eval';
import { setupTestServer } from '../../util/testServer';

describe('evalRouter - GET /:id/table with export formats', () => {
  const api = setupTestServer(() => express().use('/api/eval', evalRouter));
  const getTablePage = vi.fn();
  let mockEval: Eval;

  const mockTable = {
    head: {
      vars: ['var1', 'var2'],
      prompts: [
        createCompletedPrompt('test prompt', {
          provider: 'openai',
          label: 'prompt1',
          display: 'test',
        }),
      ],
    },
    body: [
      {
        test: { vars: { var1: 'value1', var2: 'value2' } },
        testIdx: 0,
        vars: ['value1', 'value2'],
        outputs: [
          createEvaluateTableOutput({
            text: 'output text',
            id: 'output-id',
            latencyMs: 100,
            provider: 'openai:gpt-3.5-turbo',
            gradingResult: {
              pass: true,
              score: 1,
              reason: 'Test passed',
              comment: 'Good response',
            },
            metadata: {
              redteamHistory: ['attempt1', 'attempt2'],
              messages: [
                { role: 'user', content: 'test' },
                { role: 'assistant', content: 'response' },
              ],
            },
          }),
        ],
      },
    ],
    totalCount: 1,
    filteredCount: 1,
    id: 'test-eval-id',
  };

  const mockConfig = {
    redteam: {
      strategies: ['jailbreak'],
    },
  };

  beforeEach(() => {
    getTablePage.mockReset().mockResolvedValue(mockTable);
    // Setup Eval mock
    mockEval = {
      id: 'test-eval-id',
      config: mockConfig,
      author: 'test-author',
      version: () => 4,
      getTablePage,
      getStats: () => ({ successes: 1, failures: 0, errors: 0 }),
    } as unknown as Eval;
    vi.spyOn(Eval, 'findById').mockResolvedValue(mockEval);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return CSV when format=csv is specified', async () => {
    const response = await api.get('/api/eval/test-eval-id/table').query({ format: 'csv' });
    expect(response.status).toBe(200);
    expect(parse<Record<string, string>>(response.text, { columns: true })[0]).toMatchObject({
      var1: 'value1',
      var2: 'value2',
      '[openai] prompt1': 'output text',
      Status: 'PASS',
      'Grader Reason': 'Test passed',
      Comment: 'Good response',
    });
  });

  it('should return JSON when format=json is specified', async () => {
    const response = await api.get('/api/eval/test-eval-id/table').query({ format: 'json' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ head: mockTable.head, body: mockTable.body });
  });

  it('should include red team conversation columns in CSV for red team evaluations', async () => {
    const response = await api.get('/api/eval/test-eval-id/table').query({ format: 'csv' });
    expect(response.status).toBe(200);
    const row = parse<Record<string, string>>(response.text, { columns: true })[0];
    expect(JSON.parse(row.Messages)).toEqual([
      { role: 'user', content: 'test' },
      { role: 'assistant', content: 'response' },
    ]);
    expect(JSON.parse(row.RedteamHistory)).toEqual(['attempt1', 'attempt2']);
  });

  it('should return standard table response when no format is specified', async () => {
    const response = await api.get('/api/eval/test-eval-id/table');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      table: { head: mockTable.head, body: mockTable.body },
      totalCount: 1,
      filteredCount: 1,
      config: mockConfig,
      author: 'test-author',
      version: 4,
    });
    expect(response.headers['content-disposition']).toBeUndefined();
    expect(getTablePage).toHaveBeenCalledWith({
      offset: 0,
      limit: 50, // Default limit
      filterMode: 'all',
      searchQuery: '',
      filters: [],
    });
  });

  it('should handle CSV export for non-redteam evaluations', async () => {
    // Setup eval without redteam config
    mockEval.config = {};
    const response = await api.get('/api/eval/test-eval-id/table').query({ format: 'csv' });
    expect(response.status).toBe(200);
    const row = parse<Record<string, string>>(response.text, { columns: true })[0];
    expect(row['[openai] prompt1']).toBe('output text');
    // Should not contain red team columns
    expect(row).not.toHaveProperty('Messages');
    expect(row).not.toHaveProperty('RedteamHistory');
  });

  it('should handle different red team metadata types', async () => {
    const tableWithMultipleRedteamTypes = {
      ...mockTable,
      body: [
        {
          ...mockTable.body[0],
          outputs: [
            {
              pass: true,
              text: 'output 1',
              metadata: {
                messages: [
                  { role: 'system', content: 'You are helpful' },
                  { role: 'user', content: 'Hello' },
                ],
              },
            },
          ],
        },
        {
          test: { vars: { var1: 'val3', var2: 'val4' } },
          testIdx: 1,
          vars: ['val3', 'val4'],
          outputs: [
            {
              pass: false,
              text: 'output 2',
              metadata: {
                redteamHistory: ['attempt 1', 'attempt 2', 'attempt 3'],
              },
            },
          ],
        },
        {
          test: { vars: { var1: 'val5', var2: 'val6' } },
          testIdx: 2,
          vars: ['val5', 'val6'],
          outputs: [
            {
              pass: false,
              text: 'output 3',
              metadata: {
                redteamTreeHistory: 'root->branch1->leaf1\nroot->branch2->leaf2',
              },
            },
          ],
        },
      ],
    };

    getTablePage.mockResolvedValue(tableWithMultipleRedteamTypes);
    const response = await api.get('/api/eval/test-eval-id/table').query({ format: 'csv' });
    expect(response.status).toBe(200);
    const rows = parse<Record<string, string>>(response.text, { columns: true });
    expect(JSON.parse(rows[0].Messages)).toEqual([
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hello' },
    ]);
    expect(JSON.parse(rows[1].RedteamHistory)).toEqual(['attempt 1', 'attempt 2', 'attempt 3']);
    expect(rows[2].RedteamTreeHistory).toBe('root->branch1->leaf1\nroot->branch2->leaf2');
  });

  it('should ignore pagination parameters for exports if limit exceeds the table page size', async () => {
    const response = await api.get('/api/eval/test-eval-id/table').query({
      format: 'csv',
      limit: String(EVAL_TABLE_MAX_PAGE_SIZE + 1),
      offset: '50',
    });
    expect(response.status).toBe(200);
    // When format is specified, should ignore pagination and get all data
    expect(getTablePage).toHaveBeenCalledWith(
      expect.objectContaining({
        offset: 0,
        limit: Number.MAX_SAFE_INTEGER,
      }),
    );
  });

  it('should handle filter parameters in exports', async () => {
    const response = await api.get('/api/eval/test-eval-id/table').query({
      format: 'csv',
      filterMode: 'failures',
      search: 'error',
      filter: ['provider:openai', 'status:fail'],
    });
    expect(response.status).toBe(200);
    expect(getTablePage).toHaveBeenCalledWith(
      expect.objectContaining({
        filterMode: 'failures',
        searchQuery: 'error',
        filters: ['provider:openai', 'status:fail'],
      }),
    );
  });

  it('should return 404 when evaluation not found', async () => {
    vi.mocked(Eval.findById).mockResolvedValue(undefined);
    const response = await api.get('/api/eval/test-eval-id/table');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Eval not found' });
    expect(getTablePage).not.toHaveBeenCalled();
  });

  it('should handle empty table data in CSV export', async () => {
    const emptyTable = {
      head: {
        vars: ['var1'],
        prompts: [createCompletedPrompt('test', { provider: 'openai', label: 'test' })],
      },
      body: [],
      totalCount: 0,
      filteredCount: 0,
    };

    getTablePage.mockResolvedValue(emptyTable);
    const response = await api.get('/api/eval/test-eval-id/table').query({ format: 'csv' });
    expect(response.status).toBe(200);
    const rows = parse(response.text);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('var1');
    expect(rows[0]).toContain('[openai] test');
  });

  it('should properly escape special characters in CSV', async () => {
    const tableWithSpecialChars = {
      ...mockTable,
      body: [
        {
          test: { vars: { var1: 'value,with,commas', var2: 'value"with"quotes' } },
          testIdx: 0,
          vars: ['value,with,commas', 'value"with"quotes'],
          outputs: [
            {
              pass: true,
              text: 'Output\nwith\nnewlines',
              metadata: {
                messages: [{ role: 'user', content: 'Message with "quotes" and, commas' }],
              },
            },
          ],
        },
      ],
    };

    getTablePage.mockResolvedValue(tableWithSpecialChars);
    const response = await api.get('/api/eval/test-eval-id/table').query({ format: 'csv' });
    expect(response.status).toBe(200);
    const row = parse<Record<string, string>>(response.text, { columns: true })[0];
    expect(row.var1).toBe('value,with,commas');
    expect(row.var2).toBe('value"with"quotes');
    expect(row['[openai] prompt1']).toBe('Output\nwith\nnewlines');
    expect(JSON.parse(row.Messages)).toEqual([
      { role: 'user', content: 'Message with "quotes" and, commas' },
    ]);
  });

  it('should handle very large datasets efficiently', async () => {
    // Create a large table with many rows
    const largeBody = Array.from({ length: 10000 }, (_, i) => ({
      test: { vars: { var1: `val${i}`, var2: `val${i + 1}` } },
      testIdx: i,
      vars: [`val${i}`, `val${i + 1}`],
      outputs: [
        {
          pass: i % 2 === 0,
          text: `Output ${i}`,
          metadata: {
            messages: [{ role: 'user', content: `Message ${i}` }],
          },
        },
      ],
    }));

    const largeTable = {
      head: mockTable.head,
      body: largeBody,
      totalCount: 10000,
      filteredCount: 10000,
    };

    getTablePage.mockResolvedValue(largeTable);
    const response = await api.get('/api/eval/test-eval-id/table').query({ format: 'csv' });
    expect(response.status).toBe(200);
    const rows = parse<Record<string, string>>(response.text, { columns: true });
    expect(rows).toHaveLength(10000);
    expect(rows[0].var1).toBe('val0');
    expect(rows[9999].var1).toBe('val9999');
    expect(rows[9999]['[openai] prompt1']).toBe('Output 9999');
    expect(JSON.parse(rows[9999].Messages)).toEqual([{ role: 'user', content: 'Message 9999' }]);
  });

  it('should set correct content-type headers for different formats', async () => {
    // Test CSV
    const csv = await api.get('/api/eval/test-eval-id/table').query({ format: 'csv' });
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toBe('attachment; filename="test-eval-id.csv"');
    // Test JSON
    const json = await api.get('/api/eval/test-eval-id/table').query({ format: 'json' });
    expect(json.status).toBe(200);
    expect(json.headers['content-type']).toContain('application/json');
    expect(json.headers['content-disposition']).toBe('attachment; filename="test-eval-id.json"');
    expect(json.body).toEqual({ head: mockTable.head, body: mockTable.body });
  });
});
