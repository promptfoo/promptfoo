import { z } from 'zod';
import { BULK_RATING_CONSTANTS } from '../services/bulkGrade/types';
import { EvalResultsFilterMode } from '../types/index';

const EmailSchema = z.email();

/**
 * Schema for bulk rating request.
 */
export const BulkRatingRequestSchema = z.object({
  pass: z.boolean(),
  reason: z.string().max(BULK_RATING_CONSTANTS.MAX_REASON_LENGTH),
  filterMode: EvalResultsFilterMode,
  filters: z.array(z.string()).optional(),
  searchQuery: z.string().optional(),
  confirmBulk: z.boolean().optional(),
});

export type BulkRatingRequestInput = z.infer<typeof BulkRatingRequestSchema>;

export const ApiSchemas = {
  User: {
    Get: {
      Response: z.object({
        email: EmailSchema.nullable(),
      }),
    },
    GetId: {
      Response: z.object({
        id: z.string(),
      }),
    },
    Update: {
      Request: z.object({
        email: EmailSchema,
      }),
      Response: z.object({
        success: z.boolean(),
        message: z.string(),
      }),
    },
    EmailStatus: {
      Response: z.object({
        hasEmail: z.boolean(),
        email: EmailSchema.optional(),
        status: z.enum([
          'ok',
          'exceeded_limit',
          'show_usage_warning',
          'no_email',
          'risky_email',
          'disposable_email',
        ]),
        message: z.string().optional(),
      }),
    },
  },
  Eval: {
    UpdateAuthor: {
      Params: z.object({
        id: z.string(),
      }),
      Request: z.object({
        author: z.email(),
      }),
      Response: z.object({
        message: z.string(),
      }),
    },
    MetadataKeys: {
      Params: z.object({
        id: z.string().min(3).max(128),
      }),
      Query: z.object({
        comparisonEvalIds: z.array(z.string()).optional(),
      }),
      Response: z.object({
        keys: z.array(z.string()),
      }),
    },
    MetadataValues: {
      Params: z.object({
        id: z.string().min(3).max(128),
      }),
      Query: z.object({
        key: z.string().min(1),
      }),
      Response: z.object({
        values: z.array(z.string()),
      }),
    },
    Copy: {
      Params: z.object({
        id: z.string(),
      }),
      Request: z.object({
        description: z.string().optional(),
      }),
      Response: z.object({
        id: z.string(),
        distinctTestCount: z.number(),
      }),
    },
  },
};
