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
  },
  Eval: {
    GetById: {
      Params: z.object({
        id: z.string(),
      }),
    },
    GetJob: {
      Params: z.object({
        id: z.string(),
      }),
    },
    Delete: {
      Params: z.object({
        id: z.string(),
      }),
      Response: z.object({
        message: z.string(),
      }),
    },
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
  },
  Results: {
    GetById: {
      Params: z.object({
        id: z.string(),
      }),
    },
    List: {
      Query: z.object({
        datasetId: z.string().optional(),
        type: z.enum(['redteam', 'eval']).optional(),
        includeProviders: z.coerce.boolean().optional(),
      }),
    },
    ShareCheckDomain: {
      Query: z.object({
        id: z.string(),
      }),
    },
  },
  Prompts: {
    GetByHash: {
      Params: z.object({
        sha256hash: z.string(),
      }),
    },
  },
  History: {
    List: {
      Query: z.object({
        tagName: z.string().optional(),
        tagValue: z.string().optional(),
        description: z.string().optional(),
      }),
    },
  },
  Traces: {
    GetById: {
      Params: z.object({
        traceId: z.string(),
      }),
    },
    GetByEvaluation: {
      Params: z.object({
        evaluationId: z.string(),
      }),
    },
  },
  ModelAudit: {
    GetScanById: {
      Params: z.object({
        id: z.string(),
      }),
    },
    DeleteScan: {
      Params: z.object({
        id: z.string(),
      }),
      Response: z.object({
        success: z.boolean(),
        message: z.string(),
      }),
    },
    ListScans: {
      Query: z.object({
        limit: z.coerce.number().positive().optional(),
      }),
    },
  },
  Configs: {
    GetByTypeAndId: {
      Params: z.object({
        type: z.string(),
        id: z.string(),
      }),
    },
    GetByType: {
      Params: z.object({
        type: z.string(),
      }),
    },
    List: {
      Query: z.object({
        type: z.string().optional(),
      }),
    },
  },
};
