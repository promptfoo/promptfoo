import type { Request, Response, NextFunction } from 'express';
import cliState from '../../../src/cliState';
import { doRedteamRun } from '../../../src/redteam/shared';
import { evalJobs } from '../../../src/server/routes/eval';
import { redteamRouter } from '../../../src/server/routes/redteam';

jest.mock('../../../src/redteam/shared');

describe('redteamRouter', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let mockJson: jest.Mock;
  const originalWebUI = cliState.webUI;
  const originalGlobals = {
    currentJobId: (global as any).currentJobId,
    currentAbortController: (global as any).currentAbortController,
  };

  beforeEach(() => {
    mockJson = jest.fn();
    mockRequest = {
      body: {},
      params: {},
      method: 'POST',
      url: '/run',
    };
    mockResponse = {
      json: mockJson,
      status: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
    evalJobs.clear();
    cliState.webUI = false;
    jest.clearAllMocks();
    (global as any).currentJobId = null;
    (global as any).currentAbortController = null;
  });

  afterEach(() => {
    jest.resetAllMocks();
    evalJobs.clear();
    cliState.webUI = originalWebUI;
    // Restore original globals
    (global as any).currentJobId = originalGlobals.currentJobId;
    (global as any).currentAbortController = originalGlobals.currentAbortController;
  });

  describe('POST /run', () => {
    it('should start a new redteam run and return job id', async () => {
      const mockEvalResult = {
        id: 'eval-123',
        toEvaluateSummary: jest.fn().mockResolvedValue({ summary: 'test' }),
      } as any;

      jest.mocked(doRedteamRun).mockResolvedValue(mockEvalResult);

      mockRequest.body = {
        config: { test: 'config' },
        force: true,
      };

      const routeHandler = redteamRouter.stack.find(
        (layer: any) => layer.route?.path === '/run' && layer.route?.methods?.post,
      )?.route?.stack[0]?.handle;

      if (routeHandler) {
        await routeHandler(mockRequest as Request, mockResponse as Response, mockNext);
      }

      expect(mockJson).toHaveBeenCalledWith({ id: expect.any(String) });
      expect(doRedteamRun).toHaveBeenCalledWith({
        liveRedteamConfig: { test: 'config' },
        force: true,
        verbose: undefined,
        delay: 0,
        maxConcurrency: 1,
        logCallback: expect.any(Function),
        abortSignal: expect.any(AbortSignal),
      });
    });

    it('should handle errors during redteam run', async () => {
      const testError = new Error('Test error');
      jest.mocked(doRedteamRun).mockRejectedValue(testError);

      mockRequest.body = {
        config: { test: 'config' },
        force: true,
      };

      const routeHandler = redteamRouter.stack.find(
        (layer: any) => layer.route?.path === '/run' && layer.route?.methods?.post,
      )?.route?.stack[0]?.handle;

      // Let the promise rejection be handled by the route
      if (routeHandler) {
        await routeHandler(mockRequest as Request, mockResponse as Response, mockNext);
      }

      // Wait for the async job update to complete
      // Use a small timeout instead of setImmediate for more reliable cross-platform behavior
      await new Promise((resolve) => setTimeout(resolve, 10));

      const jobId = (mockResponse.json as jest.Mock).mock.calls[0][0].id;
      const job = evalJobs.get(jobId);
      expect(job?.status).toBe('error');
      expect(job?.logs).toContain(`Error: ${testError.message}`);
    });

    it('should normalize maxConcurrency to at least 1', async () => {
      jest.mocked(doRedteamRun).mockResolvedValue({} as any);
      mockRequest.body = {
        config: {},
        maxConcurrency: 0,
      };

      const routeHandler = redteamRouter.stack.find(
        (layer: any) => layer.route?.path === '/run' && layer.route?.methods?.post,
      )?.route?.stack[0]?.handle;
      if (routeHandler) {
        await routeHandler(mockRequest as Request, mockResponse as Response, mockNext);
      }

      expect(doRedteamRun).toHaveBeenCalledWith(
        expect.objectContaining({
          maxConcurrency: 1,
        }),
      );
    });
  });

  describe('POST /cancel', () => {
    it('should return error if no job is running', async () => {
      (global as any).currentJobId = null;

      const routeHandler = redteamRouter.stack.find(
        (layer: any) => layer.route?.path === '/cancel' && layer.route?.methods?.post,
      )?.route?.stack[0]?.handle;
      if (routeHandler) {
        await routeHandler(mockRequest as Request, mockResponse as Response, mockNext);
      }
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({ error: 'No job currently running' });
    });
  });

  describe('GET /status', () => {
    it('should return status with no running job', async () => {
      (global as any).currentJobId = null;

      const routeHandler = redteamRouter.stack.find(
        (layer: any) => layer.route?.path === '/status' && layer.route?.methods?.get,
      )?.route?.stack[0]?.handle;
      if (routeHandler) {
        await routeHandler(mockRequest as Request, mockResponse as Response, mockNext);
      }
      expect(mockJson).toHaveBeenCalledWith({ hasRunningJob: false, jobId: null });
    });
  });
});
