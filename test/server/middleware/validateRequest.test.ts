import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { NextFunction, Request, Response } from 'express';
import { validateRequest, type ValidatedRequest } from '../../../src/server/middleware';

afterEach(() => {
  vi.resetAllMocks();
});

describe('validateRequest', () => {
  let mockReq: Partial<Request>;
  let mockRes: {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  let nextFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockReq = {
      params: {},
      query: {},
      body: {},
    };
    mockRes = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };
    nextFn = vi.fn();
  });

  describe('params validation', () => {
    const paramsSchema = z.object({
      id: z.string().uuid(),
    });

    it('should pass valid params', () => {
      mockReq.params = { id: '123e4567-e89b-12d3-a456-426614174000' };
      const middleware = validateRequest({ params: paramsSchema });

      middleware(mockReq as unknown as Request, mockRes as unknown as Response, nextFn as NextFunction);

      expect(nextFn).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should reject invalid params', () => {
      mockReq.params = { id: 'not-a-uuid' };
      const middleware = validateRequest({ params: paramsSchema });

      middleware(mockReq as unknown as Request, mockRes as unknown as Response, nextFn as NextFunction);

      expect(nextFn).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Invalid uuid'),
        }),
      );
    });

    it('should reject missing required params', () => {
      mockReq.params = {};
      const middleware = validateRequest({ params: paramsSchema });

      middleware(mockReq as unknown as Request, mockRes as unknown as Response, nextFn as NextFunction);

      expect(nextFn).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('query validation', () => {
    const querySchema = z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(20),
    });

    it('should pass valid query params', () => {
      mockReq.query = { page: '2', limit: '50' };
      const middleware = validateRequest({ query: querySchema });

      middleware(mockReq as unknown as Request, mockRes as unknown as Response, nextFn as NextFunction);

      expect(nextFn).toHaveBeenCalled();
      // Check that query was transformed/coerced
      expect(mockReq.query).toEqual({ page: 2, limit: 50 });
    });

    it('should apply defaults for missing optional params', () => {
      mockReq.query = {};
      const middleware = validateRequest({ query: querySchema });

      middleware(mockReq as unknown as Request, mockRes as unknown as Response, nextFn as NextFunction);

      expect(nextFn).toHaveBeenCalled();
      expect(mockReq.query).toEqual({ page: 1, limit: 20 });
    });

    it('should reject invalid query params', () => {
      mockReq.query = { page: '-1', limit: '200' };
      const middleware = validateRequest({ query: querySchema });

      middleware(mockReq as unknown as Request, mockRes as unknown as Response, nextFn as NextFunction);

      expect(nextFn).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('body validation', () => {
    const bodySchema = z.object({
      email: z.string().email(),
      name: z.string().min(1).max(100),
    });

    it('should pass valid body', () => {
      mockReq.body = { email: 'test@example.com', name: 'John' };
      const middleware = validateRequest({ body: bodySchema });

      middleware(mockReq as unknown as Request, mockRes as unknown as Response, nextFn as NextFunction);

      expect(nextFn).toHaveBeenCalled();
    });

    it('should reject invalid email', () => {
      mockReq.body = { email: 'not-an-email', name: 'John' };
      const middleware = validateRequest({ body: bodySchema });

      middleware(mockReq as unknown as Request, mockRes as unknown as Response, nextFn as NextFunction);

      expect(nextFn).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('email'),
        }),
      );
    });

    it('should reject missing required fields', () => {
      mockReq.body = { email: 'test@example.com' };
      const middleware = validateRequest({ body: bodySchema });

      middleware(mockReq as unknown as Request, mockRes as unknown as Response, nextFn as NextFunction);

      expect(nextFn).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('combined validation', () => {
    const schemas = {
      params: z.object({ id: z.string() }),
      query: z.object({ include: z.enum(['full', 'summary']).optional() }),
      body: z.object({ status: z.enum(['active', 'inactive']) }),
    };

    it('should validate all parts of the request', () => {
      mockReq.params = { id: '123' };
      mockReq.query = { include: 'full' };
      mockReq.body = { status: 'active' };
      const middleware = validateRequest(schemas);

      middleware(mockReq as unknown as Request, mockRes as unknown as Response, nextFn as NextFunction);

      expect(nextFn).toHaveBeenCalled();
    });

    it('should fail if any part is invalid', () => {
      mockReq.params = { id: '123' };
      mockReq.query = { include: 'invalid' };
      mockReq.body = { status: 'active' };
      const middleware = validateRequest(schemas);

      middleware(mockReq as unknown as Request, mockRes as unknown as Response, nextFn as NextFunction);

      expect(nextFn).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('error handling', () => {
    it('should pass non-Zod errors to next()', () => {
      const errorSchema = {
        parse: () => {
          throw new Error('Unexpected error');
        },
      } as unknown as z.ZodSchema;

      const middleware = validateRequest({ body: errorSchema });

      middleware(mockReq as unknown as Request, mockRes as unknown as Response, nextFn as NextFunction);

      expect(nextFn).toHaveBeenCalledWith(expect.any(Error));
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should use zod-validation-error for readable messages', () => {
      const schema = z.object({
        items: z.array(z.object({ name: z.string() })),
      });
      mockReq.body = { items: [{ name: 'valid' }, { name: 123 }] };

      const middleware = validateRequest({ body: schema });

      middleware(mockReq as unknown as Request, mockRes as unknown as Response, nextFn as NextFunction);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      // zod-validation-error provides human-readable messages
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Validation error'),
        }),
      );
    });
  });
});

describe('ValidatedRequest type', () => {
  it('should provide type safety for validated requests', () => {
    // This is a compile-time test - it verifies the type helper works
    type Params = { id: string };
    type Query = { page: number };
    type Body = { email: string };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const handler = (req: ValidatedRequest<Params, Query, Body>) => {
      // These should all be correctly typed
      const id: string = req.params.id;
      const page: number = req.query.page;
      const email: string = req.body.email;
      return { id, page, email };
    };

    // If this compiles, the type helper is working
    expect(handler).toBeDefined();
  });
});
