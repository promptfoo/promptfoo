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
        status: z.enum(['ok', 'exceeded_limit', 'show_usage_warning', 'no_email']),
        message: z.string().optional(),
      }),
    },
    ProbeLimit: {
      Response: z.object({
        hasExceeded: z.boolean(),
        usedProbes: z.number(),
        remainingProbes: z.number(),
        limit: z.number(),
        enabled: z.boolean(),
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
  },
};
