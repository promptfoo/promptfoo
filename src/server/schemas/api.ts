import { z } from 'zod';
import { Field, Schema } from './common';

/**
 * Centralized API schema definitions
 *
 * Organization: api.{resource}.{endpoint}.{method}.{part}
 * - resource: user, eval, results, etc.
 * - endpoint: email, byId, list, etc.
 * - method: get, post, update, delete
 * - part: params, query, body, res (response)
 *
 * Example mappings:
 * - GET /api/user/email → api.user.email.get.res
 * - PATCH /api/eval/:id/author → api.eval.author.update.params/body/res
 * - GET /api/results?type=eval → api.results.list.query/res
 */
export const api = {
  user: {
    email: {
      get: {
        res: z.object({
          email: Field.email.nullable(),
        }),
      },
      update: {
        body: z.object({
          email: Field.email,
        }),
        res: Schema.success,
      },
      status: {
        res: z.object({
          hasEmail: Field.boolean,
          email: Field.email.optional(),
          status: z.enum(['ok', 'exceeded_limit', 'show_usage_warning', 'no_email']),
          message: Field.message.optional(),
        }),
      },
    },
    id: {
      get: {
        res: Schema.id,
      },
    },
    login: {
      post: {
        body: z.object({
          apiKey: z.string().min(1, 'API key is required').max(512, 'API key too long'),
          apiHost: z.string().url().optional(),
        }),
      },
    },
    logout: {
      post: {},
    },
    cloudConfig: {
      get: {},
    },
  },

  eval: {
    byId: {
      get: {
        params: Schema.id,
      },
      patch: {
        params: Schema.id,
        body: z.object({
          table: z.any(),
          config: z.any(),
        }),
      },
      delete: {
        params: Schema.id,
        res: Schema.message,
      },
    },
    job: {
      post: {
        body: z.any(), // Complex EvaluateTestSuiteWithEvaluateOptions type
        res: z.object({
          id: Field.id,
        }),
      },
      byId: {
        params: Schema.id,
      },
    },
    author: {
      update: {
        params: Schema.id,
        body: z.object({
          author: Field.email,
        }),
        res: Schema.message,
      },
    },
    table: {
      byId: {
        params: Schema.id,
        query: z.object({
          format: z.string().optional(),
          limit: z.coerce.number().positive().default(50),
          offset: z.coerce.number().nonnegative().default(0),
          filterMode: z.enum(['all', 'failures', 'different', 'highlights']).default('all'),
          search: z.string().default(''),
          filter: z
            .union([z.string(), z.array(z.string())])
            .transform((v) => (Array.isArray(v) ? v : v ? [v] : []))
            .default([]),
          comparisonEvalIds: z
            .union([z.string(), z.array(z.string())])
            .transform((v) => (Array.isArray(v) ? v : v ? [v] : []))
            .default([]),
        }),
      },
    },
    metadataKeys: {
      byId: {
        params: z.object({
          id: Field.id.min(3).max(128),
        }),
        query: z.object({
          comparisonEvalIds: z.array(Field.id).optional(),
        }),
        res: z.object({
          keys: z.array(z.string()),
        }),
      },
    },
    results: {
      byId: {
        post: {
          params: Schema.id,
          body: z.array(z.any()), // EvalResult[]
        },
      },
    },
    replay: {
      post: {
        body: z.object({
          evaluationId: Field.id,
          prompt: z.string(),
          testIndex: z.number().optional(),
          variables: z.record(z.any()).optional(),
        }),
      },
    },
    rating: {
      update: {
        params: z.object({
          evalId: Field.id,
          id: Field.id,
        }),
        body: z.any(), // GradingResult
      },
    },
    create: {
      post: {
        body: z.any(), // Complex ResultsFile or Eval type
        res: z.object({
          id: Field.id,
        }),
      },
    },
    bulkDelete: {
      delete: {
        body: z.object({
          ids: z.array(Field.id),
        }),
      },
    },
  },

  results: {
    list: {
      query: z.object({
        datasetId: Field.id.optional(),
        type: z.enum(['redteam', 'eval']).optional(),
        includeProviders: z.coerce.boolean().optional(),
      }),
    },
    byId: {
      params: Schema.id,
    },
    share: {
      checkDomain: {
        query: Schema.id,
      },
      post: {
        body: Schema.id,
      },
    },
  },

  prompts: {
    list: {},
    byHash: {
      params: z.object({
        sha256hash: Field.sha256,
      }),
    },
  },

  datasets: {
    list: {},
    generate: {
      post: {
        body: z.object({
          prompts: z.array(z.any()),
          tests: z.array(z.any()),
        }),
      },
    },
  },

  history: {
    list: {
      query: z.object({
        tagName: z.string().optional(),
        tagValue: z.string().optional(),
        description: z.string().optional(),
      }),
    },
  },

  traces: {
    byEvaluation: {
      params: z.object({
        evaluationId: Field.id,
      }),
    },
    byId: {
      params: Schema.traceId,
    },
  },

  modelAudit: {
    checkInstalled: {},
    checkPath: {
      post: {
        body: z.object({
          path: z.string(),
        }),
      },
    },
    scan: {
      post: {
        body: z.object({
          paths: z.array(z.string()),
          options: z.any(),
        }),
      },
    },
    scans: {
      list: {
        query: z.object({
          limit: z.coerce.number().positive().optional(),
        }),
      },
      byId: {
        params: Schema.id,
        delete: {
          res: Schema.success,
        },
      },
    },
  },

  configs: {
    list: {
      query: z.object({
        type: z.string().optional(),
      }),
    },
    create: {
      post: {
        body: z.object({
          name: z.string(),
          type: z.string(),
          config: z.any(),
        }),
      },
    },
    byType: {
      params: z.object({
        type: z.string(),
      }),
      byId: {
        params: z.object({
          type: z.string(),
          id: Field.id,
        }),
      },
    },
  },

  providers: {
    test: {
      post: {
        body: z.any(), // ProviderOptions - validated separately
      },
    },
    discover: {
      post: {
        body: z.any(), // ProviderOptions - validated separately
      },
    },
    httpGenerator: {
      post: {
        body: z.object({
          requestExample: z.string(),
          responseExample: z.string().optional(),
        }),
      },
    },
    testSession: {
      post: {
        body: z.object({
          provider: z.any(),
          sessionConfig: z.any().optional(),
        }),
      },
    },
  },

  redteam: {
    generateTest: {
      post: {
        body: z.object({
          pluginId: z.string(),
          config: z.any().optional(),
        }),
      },
    },
    run: {
      post: {
        body: z.object({
          config: z.any(),
          force: z.boolean().optional(),
          verbose: z.boolean().optional(),
          delay: z.number().optional(),
          maxConcurrency: z.number().optional(),
        }),
        res: z.object({
          id: Field.id,
        }),
      },
    },
    cancel: {
      post: {},
    },
    status: {},
  },

  telemetry: {
    post: {
      body: z.object({
        event: z.string(),
        properties: z.record(z.any()).optional(),
      }),
    },
  },

  health: {},
  remoteHealth: {},
  version: {},
} as const;

/**
 * Type helpers for extracting types from API schemas
 */
export type ApiParams<T extends { params?: z.ZodType }> = T extends { params: infer P }
  ? P extends z.ZodType
    ? z.infer<P>
    : never
  : never;

export type ApiQuery<T extends { query?: z.ZodType }> = T extends { query: infer Q }
  ? Q extends z.ZodType
    ? z.infer<Q>
    : never
  : never;

export type ApiBody<T extends { body?: z.ZodType }> = T extends { body: infer B }
  ? B extends z.ZodType
    ? z.infer<B>
    : never
  : never;

export type ApiResponse<T extends { res?: z.ZodType }> = T extends { res: infer R }
  ? R extends z.ZodType
    ? z.infer<R>
    : never
  : never;
