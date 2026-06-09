import { z } from 'zod';
import { TelemetryEventSchema } from '../../telemetryEvents';
import { BooleanQueryParamSchema, JsonObjectSchema } from './common';
import { ServerResponseSchemas } from './responses.js';

const DatasetGeneratePromptSchema = z.union([
  z.string(),
  z
    .object({
      raw: z.string(),
      label: z.string().optional(),
    })
    .passthrough(),
]);
const DatasetGenerateTestSchema = z
  .object({
    vars: JsonObjectSchema.optional(),
  })
  .passthrough();

const HealthResponseSchema = ServerResponseSchemas.Health.Response;

const OpenApiResponseSchema = ServerResponseSchemas.OpenApi.Response;

const RemoteHealthResponseSchema = ServerResponseSchemas.RemoteHealth.Response;

const ListResultsQuerySchema = z.object({
  datasetId: z.string().min(1).optional(),
  type: z.enum(['redteam', 'eval']).optional(),
  includeProviders: BooleanQueryParamSchema,
});

const ListResultsResponseSchema = ServerResponseSchemas.ResultList.Response;

const ResultParamsSchema = z.object({
  id: z.string().min(1),
});

const ResultResponseSchema = ServerResponseSchemas.Result.Response;

const PromptsResponseSchema = ServerResponseSchemas.Prompts.Response;

const HistoryQuerySchema = z.object({
  tagName: z.string().min(1).optional(),
  tagValue: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});

const HistoryResponseSchema = ServerResponseSchemas.History.Response;

const PromptHashParamsSchema = z.object({
  sha256hash: z.string().regex(/^[a-f0-9]{64}$/i, 'Invalid SHA-256 hash'),
});

const PromptResponseSchema = ServerResponseSchemas.Prompt.Response;

const DatasetsResponseSchema = ServerResponseSchemas.Datasets.Response;

const ShareCheckDomainQuerySchema = z.object({
  id: z
    .string()
    .min(1)
    .refine((value) => value !== 'undefined', { message: 'id is required' }),
});

const ShareCheckDomainResponseSchema = ServerResponseSchemas.ShareCheckDomain.Response;

const ShareRequestSchema = z.object({
  id: z.string().min(1),
});

const ShareResponseSchema = ServerResponseSchemas.Share.Response;

const DatasetGenerateRequestSchema = z.object({
  prompts: z.array(DatasetGeneratePromptSchema).min(1),
  tests: z.array(DatasetGenerateTestSchema).default([]),
});

const DatasetGenerateResponseSchema = ServerResponseSchemas.DatasetGenerate.Response;

const TelemetryResponseSchema = ServerResponseSchemas.Telemetry.Response;

export { TelemetryEventSchema } from '../../telemetryEvents';

export const ServerSchemas = {
  Health: {
    Response: HealthResponseSchema,
  },
  OpenApi: {
    Response: OpenApiResponseSchema,
  },
  RemoteHealth: {
    Response: RemoteHealthResponseSchema,
  },
  ResultList: {
    Query: ListResultsQuerySchema,
    Response: ListResultsResponseSchema,
  },
  Result: {
    Params: ResultParamsSchema,
    Response: ResultResponseSchema,
  },
  Prompts: {
    Response: PromptsResponseSchema,
  },
  History: {
    Query: HistoryQuerySchema,
    Response: HistoryResponseSchema,
  },
  Prompt: {
    Params: PromptHashParamsSchema,
    Response: PromptResponseSchema,
  },
  Datasets: {
    Response: DatasetsResponseSchema,
  },
  ShareCheckDomain: {
    Query: ShareCheckDomainQuerySchema,
    Response: ShareCheckDomainResponseSchema,
  },
  Share: {
    Request: ShareRequestSchema,
    Response: ShareResponseSchema,
  },
  DatasetGenerate: {
    Request: DatasetGenerateRequestSchema,
    Response: DatasetGenerateResponseSchema,
  },
  Telemetry: {
    Request: TelemetryEventSchema,
    Response: TelemetryResponseSchema,
  },
} as const;
