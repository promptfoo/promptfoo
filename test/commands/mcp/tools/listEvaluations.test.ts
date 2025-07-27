import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ListEvaluationsTool } from '../../../../src/commands/mcp/tools/listEvaluations';
import * as evalModel from '../../../../src/models/eval';
import * as performance from '../../../../src/commands/mcp/lib/performance';

// Mock the eval model
jest.mock('../../../../src/models/eval');

// Mock the performance module
jest.mock('../../../../src/commands/mcp/lib/performance', () => ({
  paginate: jest.fn((items, options) => {
    const { page = 1, pageSize = 20 } = options || {};
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    
    return {
      data: items.slice(startIndex, endIndex),
      pagination: {
        page,
        pageSize,
        totalItems: items.length,
        totalPages: Math.ceil(items.length / pageSize),
        hasNextPage: endIndex < items.length,
        hasPreviousPage: page > 1,
      },
    };
  }),
  evaluationCache: {
    get: jest.fn(),
    set: jest.fn(),
    getStats: jest.fn(() => ({ size: 0, calculatedSize: 0 })),
    clear: jest.fn(),
  },
}));

describe('ListEvaluationsTool', () => {
  let mockServer: McpServer;
  let tool: ListEvaluationsTool;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Clear the cache mock
    (performance.evaluationCache.get as jest.Mock).mockReturnValue(undefined);
    
    mockServer = {
      tool: jest.fn(),
    } as any;
    
    tool = new ListEvaluationsTool();
  });
  
  describe('tool properties', () => {
    it('should have correct name and description', () => {
      expect(tool.name).toBe('list_evaluations');
      expect(tool.description).toBe('List and browse evaluation runs in the promptfoo database');
    });
  });
  
  describe('execute', () => {
    it('should list all evaluations when no datasetId provided', async () => {
      const mockEvals = [
        {
          id: 'eval_1',
          description: 'Test eval 1',
          createdAt: new Date().toISOString(),
          stats: { total: 10, passed: 8, failed: 2 },
        },
        {
          id: 'eval_2',
          description: 'Test eval 2',
          createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
          stats: { total: 5, passed: 5, failed: 0 },
        },
      ];
      
      (evalModel.getEvalSummaries as jest.Mock).mockResolvedValue(mockEvals);
      
      const result = await tool['execute']({});
      
      expect(evalModel.getEvalSummaries).toHaveBeenCalledWith(undefined);
      expect(result.isError).toBe(false);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.data.evaluations).toEqual(mockEvals); // All items fit in first page
      expect(response.data.summary).toMatchObject({
        totalCount: 2,
        recentCount: 1, // Only eval_1 is within 24 hours
        datasetId: 'all',
      });
    });
    
    it('should filter evaluations by datasetId', async () => {
      const mockEvals = [
        {
          id: 'eval_3',
          description: 'Dataset specific eval',
          createdAt: new Date().toISOString(),
        },
      ];
      
      (evalModel.getEvalSummaries as jest.Mock).mockResolvedValue(mockEvals);
      
      const result = await tool['execute']({ datasetId: 'dataset_123' });
      
      expect(evalModel.getEvalSummaries).toHaveBeenCalledWith('dataset_123');
      expect(result.isError).toBe(false);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.data.evaluations).toEqual(mockEvals);
      expect(response.data.summary.datasetId).toBe('dataset_123');
    });
    
    it('should handle empty results gracefully', async () => {
      (evalModel.getEvalSummaries as jest.Mock).mockResolvedValue([]);
      
      const result = await tool['execute']({});
      
      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.data.evaluations).toEqual([]);
      expect(response.data.pagination.totalItems).toBe(0);
      expect(response.data.summary.recentCount).toBe(0);
    });
    
    it('should handle database errors', async () => {
      const dbError = new Error('Failed to connect to database');
      (evalModel.getEvalSummaries as jest.Mock).mockRejectedValue(dbError);
      
      const result = await tool['execute']({});
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toContain('Failed to access evaluation database');
    });
    
    it('should handle generic errors', async () => {
      const error = new Error('Something went wrong');
      (evalModel.getEvalSummaries as jest.Mock).mockRejectedValue(error);
      
      const result = await tool['execute']({});
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Failed to list evaluations: Something went wrong');
    });
    
    it('should validate input schema', async () => {
      // This will be handled by the AbstractTool base class
      // Testing that our schema is correctly defined
      const schema = tool['schema'];
      
      // Valid input
      expect(() => schema.parse({})).not.toThrow();
      expect(() => schema.parse({ datasetId: 'test' })).not.toThrow();
      expect(() => schema.parse({ page: 1, pageSize: 50 })).not.toThrow();
      
      // Invalid input
      expect(() => schema.parse({ datasetId: 123 })).toThrow();
      expect(() => schema.parse({ page: -1 })).toThrow();
      expect(() => schema.parse({ pageSize: 200 })).toThrow();
    });
    
    it('should handle pagination correctly', async () => {
      // Create 25 mock evaluations
      const mockEvals = Array.from({ length: 25 }, (_, i) => ({
        id: `eval_${i}`,
        description: `Test eval ${i}`,
        createdAt: new Date().toISOString(),
      }));
      
      (evalModel.getEvalSummaries as jest.Mock).mockResolvedValue(mockEvals);
      
      // Test first page
      const result1 = await tool['execute']({ page: 1, pageSize: 10 });
      const response1 = JSON.parse(result1.content[0].text);
      expect(response1.data.evaluations).toHaveLength(10);
      expect(response1.data.pagination).toMatchObject({
        page: 1,
        pageSize: 10,
        totalItems: 25,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: false,
      });
      
      // Test second page
      const result2 = await tool['execute']({ page: 2, pageSize: 10 });
      const response2 = JSON.parse(result2.content[0].text);
      expect(response2.data.evaluations).toHaveLength(10);
      expect(response2.data.pagination.hasNextPage).toBe(true);
      expect(response2.data.pagination.hasPreviousPage).toBe(true);
    });
  });
  
  describe('registration', () => {
    it('should register with server correctly', () => {
      tool.register(mockServer);
      
      expect(mockServer.tool).toHaveBeenCalledWith(
        'list_evaluations',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });
}); 