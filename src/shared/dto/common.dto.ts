import { z } from 'zod';

// Generic API response wrapper
export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.any().optional(),
    }).optional(),
    meta: z.object({
      timestamp: z.string().datetime(),
      version: z.string().optional(),
      requestId: z.string().optional(),
    }).optional(),
  });

// Pagination schemas
export const PaginationRequestSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const PaginationResponseSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
});

// Common filter schemas
export const DateRangeFilterSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const SearchFilterSchema = z.object({
  query: z.string().min(1).optional(),
  fields: z.array(z.string()).optional(),
});

// Generic list response with pagination
export const ListResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    pagination: PaginationResponseSchema,
  });

// Type exports
export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: string;
    version?: string;
    requestId?: string;
  };
};

export type PaginationRequest = z.infer<typeof PaginationRequestSchema>;
export type PaginationResponse = z.infer<typeof PaginationResponseSchema>;
export type DateRangeFilter = z.infer<typeof DateRangeFilterSchema>;
export type SearchFilter = z.infer<typeof SearchFilterSchema>;

export type ListResponse<T> = {
  items: T[];
  pagination: PaginationResponse;
};