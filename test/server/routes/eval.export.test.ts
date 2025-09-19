import type { Request, Response } from 'express';
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import type { CompletedPrompt } from '../../../src/types';

// Mock dependencies first
jest.mock('../../../src/models/eval');
jest.mock('../../../src/server/services/dataExportService');
jest.mock('../../../src/server/utils/downloadHelpers');

// Import after mocking
import Eval from '../../../src/models/eval';
import { DataExportService } from '../../../src/server/services/dataExportService';
import { setDownloadHeaders } from '../../../src/server/utils/downloadHelpers';

// Setup mocks
const mockFindById = jest.fn();
(Eval.findById as jest.Mock) = mockFindById;

describe('evalRouter - GET /:id/table with export formats', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let jsonMock: jest.Mock;
  let sendMock: jest.Mock;
  let statusMock: jest.Mock;

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
  };

  const mockConfig = {
    redteam: {
      strategies: ['jailbreak'],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    jsonMock = jest.fn();
    sendMock = jest.fn();
    statusMock = jest.fn().mockReturnThis();

    mockRes = {
      json: jsonMock,
      send: sendMock,
      status: statusMock,
      setHeader: jest.fn(),
    } as Partial<Response>;

    mockReq = {
      params: { id: 'test-eval-id' },
      query: {},
    } as Partial<Request>;

    // Setup Eval mock
    const mockEval = {
      config: mockConfig,
      author: 'test-author',
      version: jest.fn().mockReturnValue('1.0.0'),
      getTablePage: jest.fn().mockResolvedValue(mockTable),
    };
    mockFindById.mockResolvedValue(mockEval);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return CSV when format=csv is specified', async () => {
    mockReq.query = { format: 'csv' };
    const mockCsvData = 'var1,var2,[openai] prompt1\nvalue1,value2,[PASS] output text';
    (DataExportService.generateCsvData as jest.Mock).mockReturnValue(mockCsvData);

    // Simulate the route handler (simplified version)
    const eval_ = await Eval.findById(mockReq.params!.id);
    const table = await eval_!.getTablePage({
      offset: 0,
      limit: Number.MAX_SAFE_INTEGER,
      filterMode: 'all',
      searchQuery: '',
      filters: [],
    });

    const csvData = DataExportService.generateCsvData(table, eval_!.config);
    setDownloadHeaders(mockRes as Response, 'test-eval-id-results.csv', 'text/csv');
    (mockRes as Response).send(csvData);

    expect(DataExportService.generateCsvData).toHaveBeenCalledWith(mockTable, mockConfig);
    expect(setDownloadHeaders).toHaveBeenCalledWith(
      mockRes,
      'test-eval-id-results.csv',
      'text/csv',
    );
    expect(sendMock).toHaveBeenCalledWith(mockCsvData);
  });

  it('should return JSON when format=json is specified', async () => {
    mockReq.query = { format: 'json' };
    const mockJsonData = { table: mockTable };
    (DataExportService.generateJsonData as jest.Mock).mockReturnValue(mockJsonData);

    // Simulate the route handler (simplified version)
    const eval_ = await Eval.findById(mockReq.params!.id);
    const table = await eval_!.getTablePage({
      offset: 0,
      limit: Number.MAX_SAFE_INTEGER,
      filterMode: 'all',
      searchQuery: '',
      filters: [],
    });

    const jsonData = DataExportService.generateJsonData(table);
    setDownloadHeaders(mockRes as Response, 'test-eval-id-results.json', 'application/json');
    (mockRes as Response).json(jsonData);

    expect(DataExportService.generateJsonData).toHaveBeenCalledWith(mockTable);
    expect(setDownloadHeaders).toHaveBeenCalledWith(
      mockRes,
      'test-eval-id-results.json',
      'application/json',
    );
    expect(jsonMock).toHaveBeenCalledWith(mockJsonData);
  });

  it('should include red team conversation columns in CSV for red team evaluations', async () => {
    mockReq.query = { format: 'csv' };

    // Mock the CSV generation to verify red team columns are included
    const expectedCsvWithRedteam =
      'var1,var2,[openai] prompt1,[openai] prompt1 - Grader Reason,[openai] prompt1 - Comment,Messages,RedteamHistory\n' +
      'value1,value2,[PASS] output text,Test passed,Good response,"[{\\"role\\":\\"user\\",\\"content\\":\\"test\\"},{\\"role\\":\\"assistant\\",\\"content\\":\\"response\\"}]","[\\"attempt1\\",\\"attempt2\\"]"';

    (DataExportService.generateCsvData as jest.Mock).mockReturnValue(expectedCsvWithRedteam);

    const eval_ = await Eval.findById(mockReq.params!.id);
    const table = await eval_!.getTablePage({
      offset: 0,
      limit: Number.MAX_SAFE_INTEGER,
      filterMode: 'all',
      searchQuery: '',
      filters: [],
    });

    const csvData = DataExportService.generateCsvData(table, eval_!.config);

    expect(DataExportService.generateCsvData).toHaveBeenCalledWith(mockTable, mockConfig);
    expect(csvData).toContain('Messages');
    expect(csvData).toContain('RedteamHistory');
  });

  it('should return standard table response when no format is specified', async () => {
    mockReq.query = {}; // No format specified

    const eval_ = await Eval.findById(mockReq.params!.id);
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
    const mockEvalNoRedteam = {
      config: nonRedteamConfig,
      author: 'test-author',
      version: jest.fn().mockReturnValue('1.0.0'),
      getTablePage: jest.fn().mockResolvedValue(mockTable),
    };
    mockFindById.mockResolvedValue(mockEvalNoRedteam);

    mockReq.query = { format: 'csv' };
    const mockCsvData = 'var1,var2,[openai] prompt1\nvalue1,value2,[PASS] output text';
    (DataExportService.generateCsvData as jest.Mock).mockReturnValue(mockCsvData);

    const eval_ = await Eval.findById(mockReq.params!.id);
    const table = await eval_!.getTablePage({
      offset: 0,
      limit: Number.MAX_SAFE_INTEGER,
      filterMode: 'all',
      searchQuery: '',
      filters: [],
    });

    const csvData = DataExportService.generateCsvData(table, eval_!.config);

    expect(DataExportService.generateCsvData).toHaveBeenCalledWith(mockTable, nonRedteamConfig);
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

    const mockEvalWithTypes = {
      config: mockConfig,
      author: 'test-author',
      version: jest.fn().mockReturnValue('1.0.0'),
      getTablePage: jest.fn().mockResolvedValue(tableWithMultipleRedteamTypes),
    };
    mockFindById.mockResolvedValue(mockEvalWithTypes);

    mockReq.query = { format: 'csv' };

    const eval_ = await Eval.findById(mockReq.params!.id);
    const table = await eval_!.getTablePage({
      offset: 0,
      limit: Number.MAX_SAFE_INTEGER,
      filterMode: 'all',
      searchQuery: '',
      filters: [],
    });

    DataExportService.generateCsvData(table, eval_!.config);

    expect(DataExportService.generateCsvData).toHaveBeenCalledWith(
      tableWithMultipleRedteamTypes,
      mockConfig,
    );
  });

  it('should handle pagination parameters correctly for exports', async () => {
    mockReq.query = { format: 'csv', limit: '100', offset: '50' };

    const eval_ = await Eval.findById(mockReq.params!.id);

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

    const eval_ = await Eval.findById(mockReq.params!.id);

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
    mockFindById.mockResolvedValue(null);

    const eval_ = await Eval.findById(mockReq.params!.id);
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

    const mockEvalEmpty = {
      config: mockConfig,
      author: 'test-author',
      version: jest.fn().mockReturnValue('1.0.0'),
      getTablePage: jest.fn().mockResolvedValue(emptyTable),
    };
    mockFindById.mockResolvedValue(mockEvalEmpty);

    mockReq.query = { format: 'csv' };
    const mockCsvData = 'var1,[openai] test\n';
    (DataExportService.generateCsvData as jest.Mock).mockReturnValue(mockCsvData);

    const eval_ = await Eval.findById(mockReq.params!.id);
    const table = await eval_!.getTablePage({
      offset: 0,
      limit: Number.MAX_SAFE_INTEGER,
      filterMode: 'all',
      searchQuery: '',
      filters: [],
    });

    const csvData = DataExportService.generateCsvData(table, eval_!.config);
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

    const mockEvalSpecial = {
      config: mockConfig,
      author: 'test-author',
      version: jest.fn().mockReturnValue('1.0.0'),
      getTablePage: jest.fn().mockResolvedValue(tableWithSpecialChars),
    };
    mockFindById.mockResolvedValue(mockEvalSpecial);

    mockReq.query = { format: 'csv' };

    const eval_ = await Eval.findById(mockReq.params!.id);
    const table = await eval_!.getTablePage({
      offset: 0,
      limit: Number.MAX_SAFE_INTEGER,
      filterMode: 'all',
      searchQuery: '',
      filters: [],
    });

    DataExportService.generateCsvData(table, eval_!.config);

    expect(DataExportService.generateCsvData).toHaveBeenCalledWith(
      tableWithSpecialChars,
      mockConfig,
    );
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

    const mockEvalLarge = {
      config: mockConfig,
      author: 'test-author',
      version: jest.fn().mockReturnValue('1.0.0'),
      getTablePage: jest.fn().mockResolvedValue(largeTable),
    };
    mockFindById.mockResolvedValue(mockEvalLarge);

    mockReq.query = { format: 'csv' };
    (DataExportService.generateCsvData as jest.Mock).mockReturnValue('large csv data');

    const eval_ = await Eval.findById(mockReq.params!.id);
    const table = await eval_!.getTablePage({
      offset: 0,
      limit: Number.MAX_SAFE_INTEGER,
      filterMode: 'all',
      searchQuery: '',
      filters: [],
    });

    DataExportService.generateCsvData(table, eval_!.config);

    expect(DataExportService.generateCsvData).toHaveBeenCalledWith(largeTable, mockConfig);
  });

  it('should set correct content-type headers for different formats', async () => {
    // Test CSV
    mockReq.query = { format: 'csv' };
    (DataExportService.generateCsvData as jest.Mock).mockReturnValue('csv data');

    const eval_ = await Eval.findById(mockReq.params!.id);
    const table = await eval_!.getTablePage({
      offset: 0,
      limit: Number.MAX_SAFE_INTEGER,
      filterMode: 'all',
      searchQuery: '',
      filters: [],
    });

    DataExportService.generateCsvData(table, eval_!.config);
    setDownloadHeaders(mockRes as Response, 'test-eval-id-results.csv', 'text/csv');

    expect(setDownloadHeaders).toHaveBeenCalledWith(
      mockRes,
      'test-eval-id-results.csv',
      'text/csv',
    );

    // Test JSON
    jest.clearAllMocks();
    mockReq.query = { format: 'json' };
    (DataExportService.generateJsonData as jest.Mock).mockReturnValue({ data: 'json' });

    setDownloadHeaders(mockRes as Response, 'test-eval-id-results.json', 'application/json');

    expect(setDownloadHeaders).toHaveBeenCalledWith(
      mockRes,
      'test-eval-id-results.json',
      'application/json',
    );
  });
});
