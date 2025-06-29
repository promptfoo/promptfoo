import { NotFoundError } from '../../../../src/commands/mcp/lib/errors';
import { ListEvaluationsTool } from '../../../../src/commands/mcp/tools/evaluation/list-evaluations';
import { getEvalSummaries } from '../../../../src/models/eval';

// Mock the getEvalSummaries function
jest.mock('../../../../src/models/eval', () => ({
  getEvalSummaries: jest.fn(),
}));

const mockGetEvalSummaries = jest.mocked(getEvalSummaries);

describe('ListEvaluationsTool', () => {
  let listEvaluationsTool: ListEvaluationsTool;
  let mockServer: any;

  beforeEach(() => {
    listEvaluationsTool = new ListEvaluationsTool();
    mockServer = {
      tool: jest.fn(),
    };
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('basic properties', () => {
    it('should have correct name and description', () => {
      expect(listEvaluationsTool.name).toBe('list_evaluations');
      expect(listEvaluationsTool.description).toBe(
        'List and browse evaluation runs with optional dataset filtering',
      );
    });
  });

  describe('registration', () => {
    it('should register with MCP server', () => {
      listEvaluationsTool.register(mockServer);

      expect(mockServer.tool).toHaveBeenCalledWith(
        'list_evaluations',
        { args: expect.any(Object) },
        expect.any(Function),
      );
    });
  });

  describe('schema validation', () => {
    it('should accept valid arguments with datasetId', async () => {
      const mockEvaluations = [
        {
          id: 'eval-1',
          description: 'Test evaluation',
          createdAt: '2024-01-01T00:00:00Z',
          stats: { total: 10, passed: 8, failed: 2 },
        },
      ];
      mockGetEvalSummaries.mockResolvedValue(mockEvaluations);

      listEvaluationsTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({ datasetId: 'dataset-123' });

      expect(result.isError).toBe(false);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(true);
      expect(mockGetEvalSummaries).toHaveBeenCalledWith('dataset-123');
    });

    it('should accept empty arguments', async () => {
      const mockEvaluations = [
        {
          id: 'eval-1',
          description: 'Test evaluation',
          createdAt: '2024-01-01T00:00:00Z',
        },
      ];
      mockGetEvalSummaries.mockResolvedValue(mockEvaluations);

      listEvaluationsTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({});

      expect(result.isError).toBe(false);
      expect(mockGetEvalSummaries).toHaveBeenCalledWith(undefined);
    });

    it('should reject invalid datasetId (empty string)', async () => {
      // Mock to return empty array so we can test the validation
      mockGetEvalSummaries.mockResolvedValue([]);

      listEvaluationsTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({ datasetId: '' });

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(false);
      // This will trigger the schema validation error or the NotFoundError
      expect(parsedContent.error).toMatch(/Invalid arguments|Evaluations not found/);
    });

    it('should reject invalid datasetId (non-string)', async () => {
      listEvaluationsTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({ datasetId: 123 });

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(false);
      expect(parsedContent.error).toContain('Invalid arguments');
    });
  });

  describe('successful execution', () => {
    it('should return evaluations when found', async () => {
      const mockEvaluations = [
        {
          id: 'eval-1',
          description: 'First evaluation',
          createdAt: '2024-01-01T00:00:00Z',
          stats: { total: 10, passed: 8, failed: 2 },
        },
        {
          id: 'eval-2',
          description: 'Second evaluation',
          createdAt: '2024-01-02T00:00:00Z',
          stats: { total: 5, passed: 5, failed: 0 },
        },
      ];
      mockGetEvalSummaries.mockResolvedValue(mockEvaluations);

      listEvaluationsTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({ datasetId: 'dataset-123' });

      expect(result.isError).toBe(false);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(true);
      expect(parsedContent.data).toEqual(mockEvaluations);
      expect(mockGetEvalSummaries).toHaveBeenCalledWith('dataset-123');
    });

    it('should return evaluations without datasetId filter', async () => {
      const mockEvaluations = [
        {
          id: 'eval-1',
          description: 'Evaluation without dataset filter',
          createdAt: '2024-01-01T00:00:00Z',
        },
      ];
      mockGetEvalSummaries.mockResolvedValue(mockEvaluations);

      listEvaluationsTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({});

      expect(result.isError).toBe(false);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(true);
      expect(parsedContent.data).toEqual(mockEvaluations);
      expect(mockGetEvalSummaries).toHaveBeenCalledWith(undefined);
    });

    it('should handle evaluations with minimal data', async () => {
      const mockEvaluations = [
        {
          id: 'eval-minimal',
          createdAt: '2024-01-01T00:00:00Z',
        },
      ];
      mockGetEvalSummaries.mockResolvedValue(mockEvaluations);

      listEvaluationsTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({});

      expect(result.isError).toBe(false);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(true);
      expect(parsedContent.data).toEqual(mockEvaluations);
    });
  });

  describe('error handling', () => {
    it('should throw NotFoundError when no evaluations found (empty array)', async () => {
      mockGetEvalSummaries.mockResolvedValue([]);

      listEvaluationsTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({ datasetId: 'nonexistent-dataset' });

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(false);
      expect(parsedContent.error).toBe('Evaluations not found');
      // Error responses don't include data in createToolResponse
      expect(parsedContent.data).toBeUndefined();
    });

    it('should throw NotFoundError when no evaluations found without dataset filter', async () => {
      mockGetEvalSummaries.mockResolvedValue([]);

      listEvaluationsTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({});

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(false);
      expect(parsedContent.error).toBe('Evaluations not found');
    });

    it('should handle database errors', async () => {
      mockGetEvalSummaries.mockRejectedValue(new Error('Database connection failed'));

      listEvaluationsTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({ datasetId: 'dataset-123' });

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(false);
      expect(parsedContent.error).toBe(
        'Failed to retrieve evaluations: Database connection failed',
      );
    });

    it('should handle unknown errors', async () => {
      mockGetEvalSummaries.mockRejectedValue('Unknown error');

      listEvaluationsTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({});

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(false);
      expect(parsedContent.error).toBe('Failed to retrieve evaluations: Unknown error');
    });

    it('should re-throw NotFoundError without wrapping', async () => {
      const notFoundError = new NotFoundError('Custom resource', 'custom-id');
      mockGetEvalSummaries.mockRejectedValue(notFoundError);

      listEvaluationsTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({});

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(false);
      expect(parsedContent.error).toBe('Custom resource with ID "custom-id" not found');
      // Error responses don't include data in createToolResponse
      expect(parsedContent.data).toBeUndefined();
    });
  });

  describe('inheritance from AbstractTool', () => {
    it('should use AbstractTool error handling', async () => {
      mockGetEvalSummaries.mockRejectedValue(new Error('Test error'));

      listEvaluationsTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({});

      // Verify response structure matches AbstractTool pattern
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('isError');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent).toHaveProperty('tool', 'list_evaluations');
      expect(parsedContent).toHaveProperty('success', false);
      expect(parsedContent).toHaveProperty('timestamp');
    });

    it('should use AbstractTool success response', async () => {
      const mockEvaluations = [{ id: 'eval-1', createdAt: '2024-01-01T00:00:00Z' }];
      mockGetEvalSummaries.mockResolvedValue(mockEvaluations);

      listEvaluationsTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({});

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent).toHaveProperty('tool', 'list_evaluations');
      expect(parsedContent).toHaveProperty('success', true);
      expect(parsedContent).toHaveProperty('timestamp');
      expect(parsedContent).toHaveProperty('data', mockEvaluations);
    });
  });

  describe('integration scenarios', () => {
    it('should handle large number of evaluations', async () => {
      const mockEvaluations = Array.from({ length: 100 }, (_, i) => ({
        id: `eval-${i}`,
        description: `Evaluation ${i}`,
        createdAt: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        stats: { total: i * 2, passed: i, failed: i },
      }));
      mockGetEvalSummaries.mockResolvedValue(mockEvaluations);

      listEvaluationsTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({});

      expect(result.isError).toBe(false);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(true);
      expect(parsedContent.data).toHaveLength(100);
    });

    it('should preserve evaluation data structure', async () => {
      const mockEvaluations = [
        {
          id: 'eval-complex',
          description: 'Complex evaluation with all fields',
          createdAt: '2024-01-01T12:00:00Z',
          stats: {
            total: 25,
            passed: 20,
            failed: 5,
          },
        },
      ];
      mockGetEvalSummaries.mockResolvedValue(mockEvaluations);

      listEvaluationsTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({});

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.data).toEqual(mockEvaluations);
      expect(parsedContent.data[0].stats.total).toBe(25);
      expect(parsedContent.data[0].stats.passed).toBe(20);
      expect(parsedContent.data[0].stats.failed).toBe(5);
    });
  });
});
