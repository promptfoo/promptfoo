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
        verbose: true,
        delay: 1000,
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
        verbose: true,
        delay: 1000,
        logCallback: expect.any(Function),
        abortSignal: expect.any(AbortSignal),
      });
    });

    it('should handle errors during redteam run', async () => {
      const error = new Error('Test error');
      jest.mocked(doRedteamRun).mockRejectedValue(error);

      mockRequest.body = {
        config: { test: 'config' },
        force: true,
        verbose: true,
        delay: 1000,
      };

      const routeHandler = redteamRouter.stack.find(
        (layer: any) => layer.route?.path === '/run' && layer.route?.methods?.post,
      )?.route?.stack[0]?.handle;

      if (routeHandler) {
        await routeHandler(mockRequest as Request, mockResponse as Response, mockNext);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      const jobs = Array.from(evalJobs.values());
      expect(mockJson).toHaveBeenCalledWith({ id: expect.any(String) });
      expect(jobs[0]?.status).toBe('error');
      expect(jobs[0]?.logs).toContain('Error: Test error');
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
      expect(mockJson).toHaveBeenCalledWith({
        error: 'No job currently running',
      });
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

      expect(mockJson).toHaveBeenCalledWith({
        hasRunningJob: false,
        jobId: null,
      });
    });
  });
});
