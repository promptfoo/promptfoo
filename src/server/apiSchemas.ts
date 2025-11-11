import { z } from 'zod';

const EmailSchema = z.string().email();

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
        author: z.string().email(),
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
