import { z } from 'zod';
import { TelemetryEventSchema } from '../../telemetryEvents';
import { BooleanQueryParamSchema, JsonObjectSchema } from './common';

const UnknownArraySchema = z.array(z.unknown());
const DataResponseSchema = z.object({ data: z.unknown() });
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

const HealthResponseSchema = z.object({
  status: z.string(),
  version: z.string(),
});

const RemoteHealthResponseSchema = z.object({
  status: z.string(),
  message: z.string(),
});

const ListResultsQuerySchema = z.object({
  datasetId: z.string().min(1).optional(),
  type: z.enum(['redteam', 'eval']).optional(),
  includeProviders: BooleanQueryParamSchema,
});

const ListResultsResponseSchema = z.object({
  data: z.array(JsonObjectSchema),
});

const ResultParamsSchema = z.object({
  id: z.string().min(1),
});

const ResultResponseSchema = DataResponseSchema;

const PromptsResponseSchema = z.object({
  data: UnknownArraySchema,
});

const HistoryQuerySchema = z.object({
  tagName: z.string().min(1).optional(),
  tagValue: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});

const HistoryResponseSchema = z.object({
  data: UnknownArraySchema,
});

const PromptHashParamsSchema = z.object({
  sha256hash: z.string().regex(/^[a-f0-9]{64}$/i, 'Invalid SHA-256 hash'),
});

const PromptResponseSchema = z.object({
  data: UnknownArraySchema,
});

const DatasetsResponseSchema = z.object({
  data: UnknownArraySchema,
});

const ShareCheckDomainQuerySchema = z.object({
  id: z
    .string()
    .min(1)
    .refine((value) => value !== 'undefined', { message: 'id is required' }),
});

const ShareCheckDomainResponseSchema = z.object({
  domain: z.string(),
  isCloudEnabled: z.boolean(),
});

const ShareRequestSchema = z.object({
  id: z.string().min(1),
});

const ShareResponseSchema = z.object({
  url: z.string().nullable().optional(),
});

const DatasetGenerateRequestSchema = z.object({
  prompts: z.array(DatasetGeneratePromptSchema).min(1),
  tests: z.array(DatasetGenerateTestSchema).default([]),
});

const DatasetGenerateResponseSchema = z.object({
  results: z.unknown(),
});

const TelemetryResponseSchema = z.object({
  success: z.literal(true),
});

export { TelemetryEventSchema } from '../../telemetryEvents';

export const ServerSchemas = {
  Health: {
    Response: HealthResponseSchema,
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
