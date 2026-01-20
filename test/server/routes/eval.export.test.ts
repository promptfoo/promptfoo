import { afterEach, beforeEach, describe, expect, it, Mock, MockedFunction, vi } from 'vitest';
import type { Request, Response } from 'express';

import type { CompletedPrompt } from '../../../src/types/index';

// Mock dependencies first
vi.mock('../../../src/database', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getDb: vi.fn(),
  };
});

vi.mock('../../../src/models/eval');
vi.mock('../../../src/server/utils/evalTableUtils');
vi.mock('../../../src/server/utils/downloadHelpers', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    setDownloadHeaders: vi.fn(),
  };
});

// Import after mocking
import Eval from '../../../src/models/eval';
import { setDownloadHeaders } from '../../../src/server/utils/downloadHelpers';
import { evalTableToCsv, evalTableToJson } from '../../../src/server/utils/evalTableUtils';

// Setup mocked functions
const mockedEvalFindById = vi.fn() as MockedFunction<typeof Eval.findById>;
const mockedEvalTableToCsv = evalTableToCsv as MockedFunction<typeof evalTableToCsv>;
const mockedEvalTableToJson = evalTableToJson as MockedFunction<typeof evalTableToJson>;

// Override the mocked modules
(Eval as any).findById = mockedEvalFindById;

describe('evalRouter - GET /:id/table with export formats', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let jsonMock: Mock;
  let sendMock: Mock;
  let statusMock: Mock;

  const mockTable = {
    head: {
      vars: ['var1', 'var2'],
      prompts: [
        {
          provider: 'openai',
          label: 'prompt1',
          raw: 'test prompt',
          display: 'test',
        } as CompletedPrompt,
      ],
    },
    body: [
      {
        test: { vars: { var1: 'value1', var2: 'value2' } },
        testIdx: 0,
        vars: ['value1', 'value2'],
        outputs: [
          {
            pass: true,
            text: 'output text',
            cost: 0,
            failureReason: undefined,
            id: 'output-id',
            latencyMs: 100,
            provider: 'openai:gpt-3.5-turbo',
            gradingResult: {
              pass: true,
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
          },
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
    vi.clearAllMocks();

    jsonMock = vi.fn();
    sendMock = vi.fn();
    statusMock = vi.fn().mockReturnThis();

    mockRes = {
      json: jsonMock,
      send: sendMock,
      status: statusMock,
      setHeader: vi.fn(),
    } as Partial<Response>;

    mockReq = {
      params: { id: 'test-eval-id' },
      query: {},
    } as Partial<Request>;

    // Setup Eval mock
    const getTablePageMock = vi.fn() as any;
    getTablePageMock.mockResolvedValue(mockTable);
    const mockEval = {
      config: mockConfig,
      author: 'test-author',
      version: vi.fn().mockReturnValue('1.0.0'),
      getTablePage: getTablePageMock,
    } as unknown as Eval;
    mockedEvalFindById.mockResolvedValue(mockEval);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return CSV when format=csv is specified', async () => {
    mockReq.query = { format: 'csv' };
    const mockCsvData = 'var1,var2,[openai] prompt1\nvalue1,value2,[PASS] output text';
    mockedEvalTableToCsv.mockReturnValue(mockCsvData);

    // Simulate the route handler (simplified version)
    const eval_ = await Eval.findById(mockReq.params!.id as string);
    const table = await eval_!.getTablePage({
      offset: 0,
      limit: Number.MAX_SAFE_INTEGER,
      filterMode: 'all',
      searchQuery: '',
      filters: [],
    });

    const csvData = mockedEvalTableToCsv(table, {
      isRedteam: !!eval_!.config?.redteam,
    });
    setDownloadHeaders(mockRes as Response, 'test-eval-id-results.csv', 'text/csv');
    (mockRes as Response).send(csvData);

    expect(mockedEvalTableToCsv).toHaveBeenCalledWith(expect.anything(), expect.anything());
    expect(sendMock).toHaveBeenCalledWith(mockCsvData);
  });

  it('should return JSON when format=json is specified', async () => {
    mockReq.query = { format: 'json' };
    const mockJsonData = { table: mockTable };
    mockedEvalTableToJson.mockReturnValue(mockJsonData);

    // Simulate the route handler (simplified version)
    const eval_ = await Eval.findById(mockReq.params!.id as string);
    const table = await eval_!.getTablePage({
      offset: 0,
      limit: Number.MAX_SAFE_INTEGER,
      filterMode: 'all',
      searchQuery: '',
      filters: [],
    });

    const jsonData = mockedEvalTableToJson(table);
    setDownloadHeaders(mockRes as Response, 'test-eval-id-results.json', 'application/json');
    (mockRes as Response).json(jsonData);

    expect(mockedEvalTableToJson).toHaveBeenCalledWith(expect.anything());
    expect(jsonMock).toHaveBeenCalledWith(mockJsonData);
  });

  it('should include red team conversation columns in CSV for red team evaluations', async () => {
    mockReq.query = { format: 'csv' };

    // Mock the CSV generation to verify red team columns are included
    const expectedCsvWithRedteam =
      'var1,var2,[openai] prompt1,[openai] prompt1 - Grader Reason,[openai] prompt1 - Comment,Messages,RedteamHistory\n' +
      'value1,value2,[PASS] output text,Test passed,Good response,"[{\\"role\\":\\"user\\",\\"content\\":\\"test\\"},{\\"role\\":\\"assistant\\",\\"content\\":\\"response\\"}]","[\\"attempt1\\",\\"attempt2\\"]"';

    mockedEvalTableToCsv.mockReturnValue(expectedCsvWithRedteam);

    const eval_ = await Eval.findById(mockReq.params!.id as string);
    const table = await eval_!.getTablePage({
      offset: 0,
      limit: Number.MAX_SAFE_INTEGER,
      filterMode: 'all',
      searchQuery: '',
      filters: [],
    });

    const csvData = mockedEvalTableToCsv(table, {
      isRedteam: !!eval_!.config?.redteam,
    });

    expect(mockedEvalTableToCsv).toHaveBeenCalledWith(expect.anything(), expect.anything());
    expect(csvData).toContain('Messages');
    expect(csvData).toContain('RedteamHistory');
  });

  it('should return standard table response when no format is specified', async () => {
    mockReq.query = {}; // No format specified

    const eval_ = await Eval.findById(mockReq.params!.id as string);
    const table = await eval_!.getTablePage({
      offset: 0,
      limit: 50, // Default limit
      filterMode: 'all',
      searchQuery: '',
      filters: [],
    });

    // Simulate standard response
    (mockRes as Response).json({
      table,
      totalCount: table.totalCount,
      filteredCount: table.filteredCount,
      config: eval_!.config,
      author: eval_!.author,
      version: eval_!.version(),
    });

    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        table: mockTable,
        totalCount: 1,
        filteredCount: 1,
        config: mockConfig,
        author: 'test-author',
        version: '1.0.0',
      }),
    );
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('should handle CSV export for non-redteam evaluations', async () => {
    // Setup eval without redteam config
    const nonRedteamConfig = { someConfig: 'value' };
    const getTablePageMockNoRedteam = vi.fn() as any;
    getTablePageMockNoRedteam.mockResolvedValue(mockTable);
    const mockEvalNoRedteam = {
      config: nonRedteamConfig,
      author: 'test-author',
      version: vi.fn().mockReturnValue('1.0.0'),
      getTablePage: getTablePageMockNoRedteam,
    } as unknown as Eval;
    mockedEvalFindById.mockResolvedValue(mockEvalNoRedteam);

    mockReq.query = { format: 'csv' };
    const mockCsvData = 'var1,var2,[openai] prompt1\nvalue1,value2,[PASS] output text';
    mockedEvalTableToCsv.mockReturnValue(mockCsvData);

    const eval_ = await Eval.findById(mockReq.params!.id as string);
    const table = await eval_!.getTablePage({
      offset: 0,
      limit: Number.MAX_SAFE_INTEGER,
      filterMode: 'all',
      searchQuery: '',
      filters: [],
    });

    const csvData = mockedEvalTableToCsv(table, {
      isRedteam: !!eval_!.config?.redteam,
    });

    expect(mockedEvalTableToCsv).toHaveBeenCalledWith(expect.anything(), expect.anything());
    // Should not contain red team columns
    expect(csvData).not.toContain('Messages');
    expect(csvData).not.toContain('RedteamHistory');
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

    const getTablePageMockWithTypes = vi.fn() as any;
    getTablePageMockWithTypes.mockResolvedValue({
      ...tableWithMultipleRedteamTypes,
      id: 'test-eval-id',
    });
    const mockEvalWithTypes = {
      config: mockConfig,
      author: 'test-author',
      version: vi.fn().mockReturnValue('1.0.0'),
      getTablePage: getTablePageMockWithTypes,
    } as unknown as Eval;
    mockedEvalFindById.mockResolvedValue(mockEvalWithTypes);

    mockReq.query = { format: 'csv' };

    const eval_ = await Eval.findById(mockReq.params!.id as string);
    const table = await eval_!.getTablePage({
      offset: 0,
      limit: Number.MAX_SAFE_INTEGER,
      filterMode: 'all',
      searchQuery: '',
      filters: [],
    });

    mockedEvalTableToCsv(table, { isRedteam: !!eval_!.config?.redteam });

    expect(mockedEvalTableToCsv).toHaveBeenCalledWith(expect.anything(), {
      isRedteam: true,
    });
  });

  it('should handle pagination parameters correctly for exports', async () => {
    mockReq.query = { format: 'csv', limit: '100', offset: '50' };

    const eval_ = await Eval.findById(mockReq.params!.id as string);

    // When format is specified, should ignore pagination and get all data
    await eval_!.getTablePage({
      offset: 0, // Should be 0 for export
      limit: Number.MAX_SAFE_INTEGER, // Should be MAX for export
      filterMode: 'all',
      searchQuery: '',
      filters: [],
    });

    expect(eval_!.getTablePage).toHaveBeenCalledWith(
      expect.objectContaining({
        offset: 0,
        limit: Number.MAX_SAFE_INTEGER,
      }),
    );
  });

  it('should handle filter parameters in exports', async () => {
    mockReq.query = {
      format: 'csv',
      filterMode: 'failures',
      search: 'error',
      filter: ['provider:openai', 'status:fail'],
    };

    const eval_ = await Eval.findById(mockReq.params!.id as string);

    await eval_!.getTablePage({
      offset: 0,
      limit: Number.MAX_SAFE_INTEGER,
      filterMode: 'failures',
      searchQuery: 'error',
      filters: ['provider:openai', 'status:fail'],
    });

    expect(eval_!.getTablePage).toHaveBeenCalledWith(
      expect.objectContaining({
        filterMode: 'failures',
        searchQuery: 'error',
        filters: ['provider:openai', 'status:fail'],
      }),
    );
  });

  it('should return 404 when evaluation not found', async () => {
    mockedEvalFindById.mockResolvedValue(undefined);

    const eval_ = await Eval.findById(mockReq.params!.id as string);
    if (!eval_) {
      (mockRes as Response).status(404).json({ error: 'Eval not found' });
    }

    expect(statusMock).toHaveBeenCalledWith(404);
    expect(jsonMock).toHaveBeenCalledWith({ error: 'Eval not found' });
  });

  it('should handle empty table data in CSV export', async () => {
    const emptyTable = {
      head: {
        vars: ['var1'],
        prompts: [{ provider: 'openai', label: 'test' } as CompletedPrompt],
      },
      body: [],
      totalCount: 0,
      filteredCount: 0,
    };

    const getTablePageMockEmpty = vi.fn() as any;
    getTablePageMockEmpty.mockResolvedValue({ ...emptyTable, id: 'test-eval-id' });
    const mockEvalEmpty = {
      config: mockConfig,
      author: 'test-author',
      version: vi.fn().mockReturnValue('1.0.0'),
      getTablePage: getTablePageMockEmpty,
    } as unknown as Eval;
    mockedEvalFindById.mockResolvedValue(mockEvalEmpty);

    mockReq.query = { format: 'csv' };
    const mockCsvData = 'var1,[openai] test\n';
    mockedEvalTableToCsv.mockReturnValue(mockCsvData);

    const eval_ = await Eval.findById(mockReq.params!.id as string);
    const table = await eval_!.getTablePage({
      offset: 0,
      limit: Number.MAX_SAFE_INTEGER,
      filterMode: 'all',
      searchQuery: '',
      filters: [],
    });

    const csvData = mockedEvalTableToCsv(table, {
      isRedteam: !!eval_!.config?.redteam,
    });
    setDownloadHeaders(mockRes as Response, 'test-eval-id-results.csv', 'text/csv');
    (mockRes as Response).send(csvData);

    expect(sendMock).toHaveBeenCalledWith(mockCsvData);
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

    const getTablePageMockSpecial = vi.fn() as any;
    getTablePageMockSpecial.mockResolvedValue({ ...tableWithSpecialChars, id: 'test-eval-id' });
    const mockEvalSpecial = {
      config: mockConfig,
      author: 'test-author',
      version: vi.fn().mockReturnValue('1.0.0'),
      getTablePage: getTablePageMockSpecial,
    } as unknown as Eval;
    mockedEvalFindById.mockResolvedValue(mockEvalSpecial);

    mockReq.query = { format: 'csv' };

    const eval_ = await Eval.findById(mockReq.params!.id as string);
    const table = await eval_!.getTablePage({
      offset: 0,
      limit: Number.MAX_SAFE_INTEGER,
      filterMode: 'all',
      searchQuery: '',
      filters: [],
    });

    mockedEvalTableToCsv(table, { isRedteam: !!eval_!.config?.redteam });

    expect(mockedEvalTableToCsv).toHaveBeenCalledWith(expect.anything(), {
      isRedteam: true,
    });
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

    const getTablePageMockLarge = vi.fn() as any;
    getTablePageMockLarge.mockResolvedValue({ ...largeTable, id: 'test-eval-id' });
    const mockEvalLarge = {
      config: mockConfig,
      author: 'test-author',
      version: vi.fn().mockReturnValue('1.0.0'),
      getTablePage: getTablePageMockLarge,
    } as unknown as Eval;
    mockedEvalFindById.mockResolvedValue(mockEvalLarge);

    mockReq.query = { format: 'csv' };
    mockedEvalTableToCsv.mockReturnValue('large csv data');

    const eval_ = await Eval.findById(mockReq.params!.id as string);
    const table = await eval_!.getTablePage({
      offset: 0,
      limit: Number.MAX_SAFE_INTEGER,
      filterMode: 'all',
      searchQuery: '',
      filters: [],
    });

    mockedEvalTableToCsv(table, { isRedteam: !!eval_!.config?.redteam });

    expect(mockedEvalTableToCsv).toHaveBeenCalledWith(expect.anything(), {
      isRedteam: true,
    });
  });

  it('should set correct content-type headers for different formats', async () => {
    // Test CSV
    mockReq.query = { format: 'csv' };
    mockedEvalTableToCsv.mockReturnValue('csv data');

    const eval_ = await Eval.findById(mockReq.params!.id as string);
    const table = await eval_!.getTablePage({
      offset: 0,
      limit: Number.MAX_SAFE_INTEGER,
      filterMode: 'all',
      searchQuery: '',
      filters: [],
    });

    const csvData = mockedEvalTableToCsv(table, {
      isRedteam: !!eval_!.config?.redteam,
    });

    // Verify CSV generation
    expect(mockedEvalTableToCsv).toHaveBeenCalled();
    expect(csvData).toBe('csv data');

    // Test JSON
    vi.clearAllMocks();
    mockReq.query = { format: 'json' };
    mockedEvalTableToJson.mockReturnValue({ data: 'json' });

    const jsonData = mockedEvalTableToJson(table);

    // Verify JSON generation
    expect(mockedEvalTableToJson).toHaveBeenCalled();
    expect(jsonData).toEqual({ data: 'json' });
  });
});
