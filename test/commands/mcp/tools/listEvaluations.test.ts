import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ListEvaluationsTool } from '../../../../src/commands/mcp/tools/listEvaluations';
import * as evalModel from '../../../../src/models/eval';

// Mock the eval model
vi.mock('../../../../src/models/eval');

describe('ListEvaluationsTool', () => {
  let mockServer: McpServer;
  let tool: ListEvaluationsTool;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    mockServer = {
      tool: vi.fn(),
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
      
      vi.mocked(evalModel.getEvalSummaries).mockResolvedValue(mockEvals);
      
      const result = await tool['execute']({});
      
      expect(evalModel.getEvalSummaries).toHaveBeenCalledWith(undefined);
      expect(result.isError).toBe(false);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.data.evaluations).toEqual(mockEvals);
      expect(response.data.summary).toEqual({
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
      
      vi.mocked(evalModel.getEvalSummaries).mockResolvedValue(mockEvals);
      
      const result = await tool['execute']({ datasetId: 'dataset_123' });
      
      expect(evalModel.getEvalSummaries).toHaveBeenCalledWith('dataset_123');
      expect(result.isError).toBe(false);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.data.evaluations).toEqual(mockEvals);
      expect(response.data.summary.datasetId).toBe('dataset_123');
    });
    
    it('should handle empty results gracefully', async () => {
      vi.mocked(evalModel.getEvalSummaries).mockResolvedValue([]);
      
      const result = await tool['execute']({});
      
      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.data.evaluations).toEqual([]);
      expect(response.data.summary.totalCount).toBe(0);
      expect(response.data.summary.recentCount).toBe(0);
    });
    
    it('should handle database errors', async () => {
      const dbError = new Error('Failed to connect to database');
      vi.mocked(evalModel.getEvalSummaries).mockRejectedValue(dbError);
      
      const result = await tool['execute']({});
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toContain('Failed to access evaluation database');
      expect(response.data.originalError).toBe('Failed to connect to database');
    });
    
    it('should handle generic errors', async () => {
      const error = new Error('Something went wrong');
      vi.mocked(evalModel.getEvalSummaries).mockRejectedValue(error);
      
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
      
      // Invalid input
      expect(() => schema.parse({ datasetId: 123 })).toThrow();
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