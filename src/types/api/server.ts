import { z } from 'zod';
import { VERSION } from '../../constants';
import { BooleanQueryParamSchema, JsonObjectSchema } from './common';

const UnknownArraySchema = z.array(z.unknown());
const DataResponseSchema = z.object({ data: z.unknown() });

export const HealthResponseSchema = z.object({
  status: z.string(),
  version: z.string(),
});

export const RemoteHealthResponseSchema = z.object({
  status: z.string(),
  message: z.string(),
});

export const ListResultsQuerySchema = z.object({
  datasetId: z.string().min(1).optional(),
  type: z.enum(['redteam', 'eval']).optional(),
  includeProviders: BooleanQueryParamSchema,
});

export const ListResultsResponseSchema = z.object({
  data: z.array(JsonObjectSchema),
});

export const ResultParamsSchema = z.object({
  id: z.string().min(1),
});

export const ResultResponseSchema = DataResponseSchema;

export const PromptsResponseSchema = z.object({
  data: UnknownArraySchema,
});

export const HistoryQuerySchema = z.object({
  tagName: z.string().min(1).optional(),
  tagValue: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});

export const HistoryResponseSchema = z.object({
  data: UnknownArraySchema,
});

export const PromptHashParamsSchema = z.object({
  sha256hash: z.string().regex(/^[a-f0-9]{64}$/i, 'Invalid SHA-256 hash'),
});

export const PromptResponseSchema = z.object({
  data: UnknownArraySchema,
});

export const DatasetsResponseSchema = z.object({
  data: UnknownArraySchema,
});

export const ShareCheckDomainQuerySchema = z.object({
  id: z
    .string()
    .min(1)
    .refine((value) => value !== 'undefined', { message: 'id is required' }),
});

export const ShareCheckDomainResponseSchema = z.object({
  domain: z.string(),
  isCloudEnabled: z.boolean(),
});

export const ShareRequestSchema = z.object({
  id: z.string().min(1),
});

export const ShareResponseSchema = z.object({
  url: z.string().nullable().optional(),
});

export const DatasetGenerateRequestSchema = z.object({
  prompts: UnknownArraySchema,
  tests: UnknownArraySchema,
});

export const DatasetGenerateResponseSchema = z.object({
  results: z.unknown(),
});

export const TelemetryEventSchema = z.object({
  event: z.enum([
    'assertion_used',
    'command_used',
    'eval setup',
    'eval_ran',
    'feature_used',
    'funnel',
    'redteam discover',
    'redteam generate',
    'redteam init',
    'redteam poison',
    'redteam report',
    'redteam run',
    'redteam setup',
    'webui_action',
    'webui_api',
    'webui_page_view',
  ]),
  packageVersion: z.string().optional().prefault(VERSION),
  properties: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  ),
});

export const TelemetryResponseSchema = z.object({
  success: z.literal(true),
});

export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;

export const ServerSchemas = {
  Health: {
    Response: HealthResponseSchema,
  },
  RemoteHealth: {
    Response: RemoteHealthResponseSchema,
  },
  Results: {
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
