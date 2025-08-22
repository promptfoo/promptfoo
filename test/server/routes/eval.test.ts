import type { Request, Response, NextFunction } from 'express';
// Import the mocked evaluate function
import { evaluate } from '../../../src/index';
import { evalJobs, evalRouter } from '../../../src/server/routes/eval';

// Mock promptfoo to avoid actual evaluation
jest.mock('../../../src/index', () => ({
  evaluate: jest.fn(),
}));

const mockEvaluate = jest.mocked(evaluate);

describe('evalRouter', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnThis();
    mockRequest = {
      body: {},
      params: {},
      method: 'POST',
    };
    mockResponse = {
      json: mockJson,
      status: mockStatus,
    };
    mockNext = jest.fn();
    evalJobs.clear();
    jest.clearAllMocks();
  });

  describe('POST /job/:id/cancel', () => {
    it('should return 404 for non-existent job', async () => {
      const cancelHandler = evalRouter.stack.find(
        (layer: any) => layer.route?.path === '/job/:id/cancel' && layer.route?.methods?.post,
      )?.route?.stack[0]?.handle;

      mockRequest.params = { id: 'non-existent-job' };

      if (cancelHandler) {
        await cancelHandler(mockRequest as Request, mockResponse as Response, mockNext);
      }

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Job not found or already completed',
      });
    });

    it('should return 404 for completed job', async () => {
      const jobId = 'completed-job-id';

      // Create a completed job in evalJobs but not in runningEvalJobs
      evalJobs.set(jobId, {
        evalId: 'eval-123',
        status: 'complete',
        progress: 100,
        total: 100,
        result: null,
        logs: ['Job completed'],
      });

      const cancelHandler = evalRouter.stack.find(
        (layer: any) => layer.route?.path === '/job/:id/cancel' && layer.route?.methods?.post,
      )?.route?.stack[0]?.handle;

      mockRequest.params = { id: jobId };

      if (cancelHandler) {
        await cancelHandler(mockRequest as Request, mockResponse as Response, mockNext);
      }

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Job not found or already completed',
      });
    });

    it('should handle cancellation API endpoint structure', () => {
      // Verify the cancel endpoint exists in the router
      const cancelRoute = evalRouter.stack.find(
        (layer: any) => layer.route?.path === '/job/:id/cancel',
      );

      expect(cancelRoute).toBeDefined();
      expect(cancelRoute?.route?.path).toBe('/job/:id/cancel');
    });
  });

  describe('POST /job', () => {
    it('should create a new eval job with abort signal', async () => {
      // Mock evaluate to return a simple result - the actual structure doesn't matter for this test
      const mockResult = {
        id: 'eval-123',
        toEvaluateSummary: jest.fn().mockResolvedValue({ summary: 'test' }),
      } as any;
      mockEvaluate.mockResolvedValue(mockResult);

      mockRequest.body = {
        prompts: ['test prompt'],
        providers: ['openai:gpt-3.5-turbo'],
        tests: [{ vars: { input: 'test' } }],
        evaluateOptions: {},
      };

      const jobHandler = evalRouter.stack.find(
        (layer: any) => layer.route?.path === '/job' && layer.route?.methods?.post,
      )?.route?.stack[0]?.handle;

      if (jobHandler) {
        await jobHandler(mockRequest as Request, mockResponse as Response, mockNext);
      }

      expect(mockJson).toHaveBeenCalledWith({ id: expect.any(String) });
      expect(mockEvaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          prompts: ['test prompt'],
          providers: ['openai:gpt-3.5-turbo'],
          tests: [{ vars: { input: 'test' } }],
          writeLatestResults: true,
          sharing: true,
        }),
        expect.objectContaining({
          eventSource: 'web',
          abortSignal: expect.any(AbortSignal),
          progressCallback: expect.any(Function),
        }),
      );
    });

    it('should handle evaluation errors with cancellation detection', async () => {
      // Mock evaluate to reject with AbortError-like error
      const abortError = new Error('Operation cancelled');
      mockEvaluate.mockRejectedValue(abortError);

      mockRequest.body = {
        prompts: ['test prompt'],
        providers: ['openai:gpt-3.5-turbo'],
        tests: [{ vars: { input: 'test' } }],
        evaluateOptions: {},
      };

      const jobHandler = evalRouter.stack.find(
        (layer: any) => layer.route?.path === '/job' && layer.route?.methods?.post,
      )?.route?.stack[0]?.handle;

      if (jobHandler) {
        await jobHandler(mockRequest as Request, mockResponse as Response, mockNext);
      }

      expect(mockJson).toHaveBeenCalledWith({ id: expect.any(String) });

      // Let the async evaluation complete
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Check that a job was created and eventually failed
      const jobId = mockJson.mock.calls[0][0].id;
      const job = evalJobs.get(jobId);

      expect(job).toBeDefined();
      expect(job?.status).toBe('error');
    });

    it('should create jobs with unique IDs', async () => {
      const mockResult = {
        id: 'eval-123',
        toEvaluateSummary: jest.fn().mockResolvedValue({ summary: 'test' }),
      } as any;
      mockEvaluate.mockResolvedValue(mockResult);

      mockRequest.body = {
        prompts: ['test prompt'],
        providers: ['openai:gpt-3.5-turbo'],
        tests: [{ vars: { input: 'test' } }],
        evaluateOptions: {},
      };

      const jobHandler = evalRouter.stack.find(
        (layer: any) => layer.route?.path === '/job' && layer.route?.methods?.post,
      )?.route?.stack[0]?.handle;

      // Create first job
      if (jobHandler) {
        await jobHandler(mockRequest as Request, mockResponse as Response, mockNext);
      }
      const firstJobId = mockJson.mock.calls[0][0].id;

      // Reset mock and create second job
      mockJson.mockClear();
      if (jobHandler) {
        await jobHandler(mockRequest as Request, mockResponse as Response, mockNext);
      }
      const secondJobId = mockJson.mock.calls[0][0].id;

      expect(firstJobId).not.toBe(secondJobId);
      expect(evalJobs.has(firstJobId)).toBe(true);
      expect(evalJobs.has(secondJobId)).toBe(true);
    });
  });
});
