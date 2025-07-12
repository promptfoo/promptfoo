import { Request, Response } from 'express';
import { z } from 'zod';
import { getTraceStore } from '../../src/tracing/store';
import { tracesRouter } from '../../src/server/routes/traces';
import { ApiSchemas } from '../../src/server/apiSchemas';

jest.mock('../../src/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../src/tracing/store');

describe('Traces Routes', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockTraceStore: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockTraceStore = {
      getTracesByEvaluation: jest.fn(),
      getTrace: jest.fn(),
    };
    (getTraceStore as jest.Mock).mockReturnValue(mockTraceStore);

    mockRequest = {
      params: {},
      query: {},
      body: {},
    };

    mockResponse = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
  });

  describe('GET /evaluation/:evaluationId', () => {
    it('should return traces for a valid evaluation ID', async () => {
      const evaluationId = 'eval-123';
      const mockTraces = [
        {
          traceId: 'trace-1',
          evalId: evaluationId,
          createdAt: new Date().toISOString(),
          spans: [],
        },
        {
          traceId: 'trace-2',
          evalId: evaluationId,
          createdAt: new Date().toISOString(),
          spans: [],
        },
      ];

      mockRequest.params = { evaluationId };
      mockTraceStore.getTracesByEvaluation.mockResolvedValue(mockTraces);

      const route = tracesRouter.stack.find(
        (layer) => layer.route?.path === '/evaluation/:evaluationId' && layer.route.methods.get
      );
      await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);

      expect(mockTraceStore.getTracesByEvaluation).toHaveBeenCalledWith(evaluationId);
      expect(mockResponse.json).toHaveBeenCalledWith({ traces: mockTraces });
    });

    it('should return 500 for empty evaluation ID', async () => {
      mockRequest.params = { evaluationId: '' };

      const route = tracesRouter.stack.find(
        (layer) => layer.route?.path === '/evaluation/:evaluationId' && layer.route.methods.get
      );
      await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);

      // Empty string is accepted by the Zod schema, so it gets passed to the store
      // which likely causes an error, resulting in 500
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(String) })
      );
    });

    it('should return 500 when trace store throws an error', async () => {
      mockRequest.params = { evaluationId: 'eval-123' };
      mockTraceStore.getTracesByEvaluation.mockRejectedValue(new Error('Database error'));

      const route = tracesRouter.stack.find(
        (layer) => layer.route?.path === '/evaluation/:evaluationId' && layer.route.methods.get
      );
      await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Failed to fetch traces' });
    });

    it('should validate response matches DTO schema', async () => {
      const evaluationId = 'eval-123';
      const mockTraces = [
        {
          traceId: 'trace-1',
          evalId: evaluationId,
          createdAt: new Date().toISOString(),
          spans: [],
        },
      ];

      mockRequest.params = { evaluationId };
      mockTraceStore.getTracesByEvaluation.mockResolvedValue(mockTraces);

      const route = tracesRouter.stack.find(
        (layer) => layer.route?.path === '/evaluation/:evaluationId' && layer.route.methods.get
      );
      await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);

      // Validate that the response matches our DTO schema
      const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(() => ApiSchemas.Trace.GetByEvaluation.Response.parse(responseData)).not.toThrow();
    });
  });

  describe('GET /:traceId', () => {
    it('should return a trace for a valid trace ID', async () => {
      const traceId = 'trace-123';
      const mockTrace = {
        traceId: traceId,
        evalId: 'eval-456',
        createdAt: new Date().toISOString(),
        spans: [
          {
            spanId: 'span-1',
            traceId: traceId,
            name: 'Test Span',
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            attributes: {},
          },
        ],
      };

      mockRequest.params = { traceId };
      mockTraceStore.getTrace.mockResolvedValue(mockTrace);

      const route = tracesRouter.stack.find(
        (layer) => layer.route?.path === '/:traceId' && layer.route.methods.get
      );
      await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);

      expect(mockTraceStore.getTrace).toHaveBeenCalledWith(traceId);
      expect(mockResponse.json).toHaveBeenCalledWith({ trace: mockTrace });
    });

    it('should return 404 when trace is not found', async () => {
      const traceId = 'non-existent';
      mockRequest.params = { traceId };
      mockTraceStore.getTrace.mockResolvedValue(null);

      const route = tracesRouter.stack.find(
        (layer) => layer.route?.path === '/:traceId' && layer.route.methods.get
      );
      await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Trace not found' });
    });

    it('should return 404 for empty trace ID', async () => {
      mockRequest.params = { traceId: '' };
      mockTraceStore.getTrace.mockResolvedValue(null);

      const route = tracesRouter.stack.find(
        (layer) => layer.route?.path === '/:traceId' && layer.route.methods.get
      );
      await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);

      // Empty string is accepted by the Zod schema, so it gets passed to the store
      // which returns null, resulting in 404
      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Trace not found' });
    });

    it('should return 500 when trace store throws an error', async () => {
      mockRequest.params = { traceId: 'trace-123' };
      mockTraceStore.getTrace.mockRejectedValue(new Error('Database error'));

      const route = tracesRouter.stack.find(
        (layer) => layer.route?.path === '/:traceId' && layer.route.methods.get
      );
      await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Failed to fetch trace' });
    });

    it('should validate response matches DTO schema', async () => {
      const traceId = 'trace-123';
      const mockTrace = {
        traceId: traceId,
        evalId: 'eval-456',
        createdAt: new Date().toISOString(),
        spans: [],
      };

      mockRequest.params = { traceId };
      mockTraceStore.getTrace.mockResolvedValue(mockTrace);

      const route = tracesRouter.stack.find(
        (layer) => layer.route?.path === '/:traceId' && layer.route.methods.get
      );
      await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);

      // Validate that the response matches our DTO schema
      const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(() => ApiSchemas.Trace.Get.Response.parse(responseData)).not.toThrow();
    });
  });
});