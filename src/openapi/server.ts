import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  type ResponseConfig,
  type RouteConfig,
  type ZodMediaTypeObject,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { VERSION } from '../constants';
import { BlobsSchemas } from '../types/api/blobs';
import { ErrorResponseSchema } from '../types/api/common';
import { ConfigSchemas } from '../types/api/configs';
import { EvalSchemas } from '../types/api/eval';
import { MediaSchemas } from '../types/api/media';
import { ModelAuditSchemas } from '../types/api/modelAudit';
import { JsonProviderOptionsWithIdSchema, ProviderSchemas } from '../types/api/providers';
import { RedteamSchemas } from '../types/api/redteam';
import { ServerSchemas } from '../types/api/server';
import { TracesSchemas } from '../types/api/traces';
import { UserSchemas } from '../types/api/user';
import { VersionSchemas } from '../types/api/version';

extendZodWithOpenApi(z);

const APPLICATION_JSON = 'application/json';
const TEXT_CSV = 'text/csv';
const SERVER_OPENAPI_VERSION = '3.1.0';

// OpenAPI path parameters are independent fields; runtime media schemas also
// enforce that blob uses a full hash while legacy types use short filenames.
const OpenApiMediaParamsSchema = z.object({
  type: z.enum(['audio', 'image', 'video', 'blob']),
  filename: z
    .string()
    .regex(/^(?:[a-f0-9]{12}\.[a-z0-9]+|[a-f0-9]{64})$/i)
    .describe('Full SHA256 for blob; 12-character hash plus extension for legacy media'),
});

const OpenApiLooseObjectSchema = z.record(z.string(), z.unknown());
const OpenApiProvidersSchema = z.union([
  z.string(),
  z.array(z.unknown()),
  OpenApiLooseObjectSchema,
]);

const OpenApiCreateJobRequestSchema = z
  .object({
    prompts: z.array(z.union([z.string(), OpenApiLooseObjectSchema])),
    providers: OpenApiProvidersSchema,
    tests: z.array(z.unknown()).optional(),
    evaluateOptions: OpenApiLooseObjectSchema.optional(),
  })
  .passthrough();

// Provider test routes still parse ProviderOptionsWithIdSchema at runtime. Keep
// their OpenAPI shape intentionally loose instead of advertising preview-only
// JSON env semantics that those routes do not preserve.
const OpenApiProviderOptionsWithIdSchema = z
  .object({
    id: z.string().min(1),
  })
  .passthrough();

const OpenApiTestProviderRequestSchema = z.object({
  prompt: z.string().optional(),
  providerOptions: OpenApiProviderOptionsWithIdSchema,
});

const OpenApiTestSessionRequestSchema = z.object({
  provider: OpenApiProviderOptionsWithIdSchema,
  sessionConfig: z
    .object({
      sessionSource: z.string().optional(),
      sessionParser: z.string().optional(),
    })
    .optional(),
  mainInputVariable: z.string().optional(),
});

// Runtime normalization accepts blank/incomplete provider values as unset. OpenAPI
// documents only the non-empty values that remain after normalization.
const OpenApiPreviewGenerationProviderSchema = z.union([
  z.string().min(1),
  JsonProviderOptionsWithIdSchema,
]);

const OpenApiTestCaseGenerationRequestSchema = RedteamSchemas.GenerateTest.Request.extend({
  provider: OpenApiPreviewGenerationProviderSchema.optional(),
});

const OpenApiEvalTableJsonResponseSchema = z.union([
  EvalSchemas.Table.Response,
  EvalSchemas.Table.JsonExportResponse,
]);

export const SERVER_OPENAPI_ROUTE_COUNT = 67;

type OpenApiSchema = NonNullable<ZodMediaTypeObject['schema']>;
type OpenApiResponse = ResponseConfig & { description: string };
type RegisteredRouteConfig = RouteConfig & {
  operationId: string;
  tags: string[];
};

export function createServerOpenApiRegistry() {
  const registry = new OpenAPIRegistry();
  const routes: RegisteredRouteConfig[] = [];

  // The DTO schemas are created before this generator runs. Passing them directly
  // keeps @asteasolutions/zod-to-openapi isolated to docs generation instead of
  // importing it from runtime validation modules just to attach `.openapi()`.

  function jsonBody(zodSchema: z.ZodType, description = 'JSON request body') {
    return {
      description,
      required: true,
      content: {
        [APPLICATION_JSON]: {
          schema: zodSchema,
        },
      },
    };
  }

  function jsonResponse(
    zodSchema: OpenApiSchema,
    description = 'Successful response',
  ): OpenApiResponse {
    return {
      description,
      content: {
        [APPLICATION_JSON]: {
          schema: zodSchema,
        },
      },
    };
  }

  function evalTableResponse(): OpenApiResponse {
    return {
      description:
        'Evaluation table data. `format=json` returns an exported table object and `format=csv` returns CSV.',
      content: {
        [APPLICATION_JSON]: {
          schema: OpenApiEvalTableJsonResponseSchema,
        },
        [TEXT_CSV]: {
          schema: {
            type: 'string',
          },
        },
      },
    };
  }

  function noContent(description = 'No content'): OpenApiResponse {
    return { description };
  }

  function binaryResponse(description: string): OpenApiResponse {
    return {
      description,
      content: {
        'application/octet-stream': {
          schema: {
            type: 'string',
            format: 'binary',
          },
        },
      },
    };
  }

  function redirectResponse(description: string): OpenApiResponse {
    return {
      description,
      headers: {
        Location: {
          description: 'Redirect target URL',
          schema: { type: 'string', format: 'uri' },
        },
      },
    };
  }

  function register(route: RegisteredRouteConfig) {
    routes.push(route);
    registry.registerPath(route);
  }

  register({
    method: 'get',
    path: '/health',
    operationId: 'getHealth',
    tags: ['Health'],
    summary: 'Check local server health',
    responses: {
      200: jsonResponse(ServerSchemas.Health.Response),
    },
  });

  register({
    method: 'get',
    path: '/api/remote-health',
    operationId: 'getRemoteHealth',
    tags: ['Health'],
    summary: 'Check remote generation health',
    responses: {
      200: jsonResponse(ServerSchemas.RemoteHealth.Response),
    },
  });

  register({
    method: 'get',
    path: '/api/results',
    operationId: 'listResults',
    tags: ['Results'],
    summary: 'List evaluation result summaries',
    request: {
      query: ServerSchemas.ResultList.Query,
    },
    responses: {
      200: jsonResponse(ServerSchemas.ResultList.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
    },
  });

  register({
    method: 'get',
    path: '/api/results/{id}',
    operationId: 'getResult',
    tags: ['Results'],
    summary: 'Get one evaluation result',
    request: {
      params: ServerSchemas.Result.Params,
    },
    responses: {
      200: jsonResponse(ServerSchemas.Result.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      404: jsonResponse(ErrorResponseSchema, 'Result not found'),
    },
  });

  register({
    method: 'get',
    path: '/api/prompts',
    operationId: 'listPrompts',
    tags: ['Prompts'],
    summary: 'List known prompts',
    responses: {
      200: jsonResponse(ServerSchemas.Prompts.Response),
    },
  });

  register({
    method: 'get',
    path: '/api/history',
    operationId: 'listHistory',
    tags: ['Results'],
    summary: 'List standalone evaluation history',
    request: {
      query: ServerSchemas.History.Query,
    },
    responses: {
      200: jsonResponse(ServerSchemas.History.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
    },
  });

  register({
    method: 'get',
    path: '/api/prompts/{sha256hash}',
    operationId: 'getPromptByHash',
    tags: ['Prompts'],
    summary: 'Get prompts for a test-case hash',
    request: {
      params: ServerSchemas.Prompt.Params,
    },
    responses: {
      200: jsonResponse(ServerSchemas.Prompt.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
    },
  });

  register({
    method: 'get',
    path: '/api/datasets',
    operationId: 'listDatasets',
    tags: ['Datasets'],
    summary: 'List known datasets',
    responses: {
      200: jsonResponse(ServerSchemas.Datasets.Response),
    },
  });

  register({
    method: 'get',
    path: '/api/results/share/check-domain',
    operationId: 'checkShareDomain',
    tags: ['Sharing'],
    summary: 'Check where an evaluation will be shared',
    request: {
      query: ServerSchemas.ShareCheckDomain.Query,
    },
    responses: {
      200: jsonResponse(ServerSchemas.ShareCheckDomain.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      404: jsonResponse(ErrorResponseSchema, 'Evaluation not found'),
    },
  });

  register({
    method: 'post',
    path: '/api/results/share',
    operationId: 'shareResult',
    tags: ['Sharing'],
    summary: 'Create a shareable evaluation URL',
    request: {
      body: jsonBody(ServerSchemas.Share.Request),
    },
    responses: {
      200: jsonResponse(ServerSchemas.Share.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      404: jsonResponse(ErrorResponseSchema, 'Evaluation not found'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'post',
    path: '/api/dataset/generate',
    operationId: 'generateDataset',
    tags: ['Datasets'],
    summary: 'Generate synthetic dataset rows',
    request: {
      body: jsonBody(ServerSchemas.DatasetGenerate.Request),
    },
    responses: {
      200: jsonResponse(ServerSchemas.DatasetGenerate.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
    },
  });

  register({
    method: 'post',
    path: '/api/telemetry',
    operationId: 'recordTelemetry',
    tags: ['Telemetry'],
    summary: 'Record a web UI telemetry event',
    request: {
      body: jsonBody(ServerSchemas.Telemetry.Request),
    },
    responses: {
      200: jsonResponse(ServerSchemas.Telemetry.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'get',
    path: '/api/configs',
    operationId: 'listConfigs',
    tags: ['Configs'],
    summary: 'List stored configs',
    request: {
      query: ConfigSchemas.List.Query,
    },
    responses: {
      200: jsonResponse(ConfigSchemas.List.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'post',
    path: '/api/configs',
    operationId: 'createConfig',
    tags: ['Configs'],
    summary: 'Create a stored config',
    request: {
      body: jsonBody(ConfigSchemas.Create.Request),
    },
    responses: {
      200: jsonResponse(ConfigSchemas.Create.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'get',
    path: '/api/configs/{type}',
    operationId: 'listConfigsByType',
    tags: ['Configs'],
    summary: 'List stored configs by type',
    request: {
      params: ConfigSchemas.ListByType.Params,
    },
    responses: {
      200: jsonResponse(ConfigSchemas.ListByType.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'get',
    path: '/api/configs/{type}/{id}',
    operationId: 'getConfig',
    tags: ['Configs'],
    summary: 'Get a stored config',
    request: {
      params: ConfigSchemas.Get.Params,
    },
    responses: {
      200: jsonResponse(ConfigSchemas.Get.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      404: jsonResponse(ErrorResponseSchema, 'Config not found'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'post',
    path: '/api/eval/job',
    operationId: 'createEvalJob',
    tags: ['Eval'],
    summary: 'Start an evaluation job',
    request: {
      body: jsonBody(OpenApiCreateJobRequestSchema),
    },
    responses: {
      200: jsonResponse(EvalSchemas.CreateJob.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
    },
  });

  register({
    method: 'get',
    path: '/api/eval/job/{id}',
    operationId: 'getEvalJob',
    tags: ['Eval'],
    summary: 'Get evaluation job status',
    request: {
      params: EvalSchemas.GetJob.Params,
    },
    responses: {
      200: jsonResponse(EvalSchemas.GetJob.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      404: jsonResponse(ErrorResponseSchema, 'Job not found'),
    },
  });

  register({
    method: 'patch',
    path: '/api/eval/{id}',
    operationId: 'updateEval',
    tags: ['Eval'],
    summary: 'Update an evaluation table or config',
    request: {
      params: EvalSchemas.Update.Params,
      body: jsonBody(EvalSchemas.Update.Request),
    },
    responses: {
      200: jsonResponse(EvalSchemas.Update.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'patch',
    path: '/api/eval/{id}/author',
    operationId: 'updateEvalAuthor',
    tags: ['Eval'],
    summary: 'Update evaluation author',
    request: {
      params: EvalSchemas.UpdateAuthor.Params,
      body: jsonBody(EvalSchemas.UpdateAuthor.Request),
    },
    responses: {
      200: jsonResponse(EvalSchemas.UpdateAuthor.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      404: jsonResponse(ErrorResponseSchema, 'Evaluation not found'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'get',
    path: '/api/eval/{id}/table',
    operationId: 'getEvalTable',
    tags: ['Eval'],
    summary: 'Get evaluation table data',
    request: {
      params: EvalSchemas.Table.Params,
      query: EvalSchemas.Table.Query,
    },
    responses: {
      200: evalTableResponse(),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      404: jsonResponse(ErrorResponseSchema, 'Evaluation not found'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
      413: jsonResponse(ErrorResponseSchema, 'Evaluation table is too large'),
    },
  });

  register({
    method: 'get',
    path: '/api/eval/{id}/metadata-keys',
    operationId: 'getEvalMetadataKeys',
    tags: ['Eval'],
    summary: 'List metadata keys for an evaluation',
    request: {
      params: EvalSchemas.MetadataKeys.Params,
      query: EvalSchemas.MetadataKeys.Query,
    },
    responses: {
      200: jsonResponse(EvalSchemas.MetadataKeys.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      404: jsonResponse(ErrorResponseSchema, 'Evaluation not found'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'get',
    path: '/api/eval/{id}/metadata-values',
    operationId: 'getEvalMetadataValues',
    tags: ['Eval'],
    summary: 'List metadata values for one key',
    request: {
      params: EvalSchemas.MetadataValues.Params,
      query: EvalSchemas.MetadataValues.Query,
    },
    responses: {
      200: jsonResponse(EvalSchemas.MetadataValues.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      404: jsonResponse(ErrorResponseSchema, 'Evaluation not found'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'post',
    path: '/api/eval/{id}/results',
    operationId: 'addEvalResults',
    tags: ['Eval'],
    summary: 'Append results to an evaluation',
    request: {
      params: EvalSchemas.AddResults.Params,
      body: jsonBody(EvalSchemas.AddResults.Request),
    },
    responses: {
      204: noContent('Results added'),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      404: jsonResponse(ErrorResponseSchema, 'Evaluation not found'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'post',
    path: '/api/eval/replay',
    operationId: 'replayEval',
    tags: ['Eval'],
    summary: 'Replay one evaluation test',
    request: {
      body: jsonBody(EvalSchemas.Replay.Request),
    },
    responses: {
      200: jsonResponse(EvalSchemas.Replay.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      404: jsonResponse(ErrorResponseSchema, 'Evaluation not found'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'post',
    path: '/api/eval/{evalId}/results/{id}/rating',
    operationId: 'submitEvalResultRating',
    tags: ['Eval'],
    summary: 'Submit a rating for one result',
    request: {
      params: EvalSchemas.SubmitRating.Params,
      body: jsonBody(EvalSchemas.SubmitRating.Request),
    },
    responses: {
      200: jsonResponse(EvalSchemas.SubmitRating.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      404: jsonResponse(ErrorResponseSchema, 'Result or evaluation not found'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'post',
    path: '/api/eval',
    operationId: 'saveEval',
    tags: ['Eval'],
    summary: 'Save an evaluation result',
    request: {
      body: jsonBody(EvalSchemas.Save.Request),
    },
    responses: {
      200: jsonResponse(EvalSchemas.Save.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'delete',
    path: '/api/eval/{id}',
    operationId: 'deleteEval',
    tags: ['Eval'],
    summary: 'Delete one evaluation',
    request: {
      params: EvalSchemas.Delete.Params,
    },
    responses: {
      200: jsonResponse(EvalSchemas.Delete.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      404: jsonResponse(ErrorResponseSchema, 'Evaluation not found'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'delete',
    path: '/api/eval',
    operationId: 'bulkDeleteEvals',
    tags: ['Eval'],
    summary: 'Delete multiple evaluations',
    request: {
      body: jsonBody(EvalSchemas.BulkDelete.Request),
    },
    responses: {
      204: noContent('Evaluations deleted'),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'post',
    path: '/api/eval/{id}/copy',
    operationId: 'copyEval',
    tags: ['Eval'],
    summary: 'Copy an evaluation',
    request: {
      params: EvalSchemas.Copy.Params,
      body: jsonBody(EvalSchemas.Copy.Request),
    },
    responses: {
      201: jsonResponse(EvalSchemas.Copy.Response, 'Evaluation copied'),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      404: jsonResponse(ErrorResponseSchema, 'Evaluation not found'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'get',
    path: '/api/media/stats',
    operationId: 'getMediaStats',
    tags: ['Media'],
    summary: 'Get media storage stats',
    responses: {
      200: jsonResponse(MediaSchemas.Stats.Response),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'get',
    path: '/api/media/info/{type}/{filename}',
    operationId: 'getMediaInfo',
    tags: ['Media'],
    summary: 'Get media file metadata',
    request: {
      params: OpenApiMediaParamsSchema,
    },
    responses: {
      200: jsonResponse(MediaSchemas.Info.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      404: jsonResponse(ErrorResponseSchema, 'Media not found'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'get',
    path: '/api/media/{type}/{filename}',
    operationId: 'getMedia',
    tags: ['Media'],
    summary: 'Fetch media file bytes',
    request: {
      params: OpenApiMediaParamsSchema,
    },
    responses: {
      200: binaryResponse('Media bytes'),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      404: jsonResponse(ErrorResponseSchema, 'Media not found'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'get',
    path: '/api/model-audit/check-installed',
    operationId: 'checkModelAuditInstalled',
    tags: ['Model Audit'],
    summary: 'Check whether ModelAudit is installed',
    responses: {
      200: jsonResponse(ModelAuditSchemas.CheckInstalled.Response),
    },
  });

  register({
    method: 'get',
    path: '/api/model-audit/scanners',
    operationId: 'listModelAuditScanners',
    tags: ['Model Audit'],
    summary: 'List available ModelAudit scanners',
    responses: {
      200: jsonResponse(ModelAuditSchemas.ListScanners.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'post',
    path: '/api/model-audit/check-path',
    operationId: 'checkModelAuditPath',
    tags: ['Model Audit'],
    summary: 'Check whether a filesystem path exists',
    request: {
      body: jsonBody(ModelAuditSchemas.CheckPath.Request),
    },
    responses: {
      200: jsonResponse(ModelAuditSchemas.CheckPath.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'post',
    path: '/api/model-audit/scan',
    operationId: 'runModelAuditScan',
    tags: ['Model Audit'],
    summary: 'Run a ModelAudit scan',
    request: {
      body: jsonBody(ModelAuditSchemas.Scan.Request),
    },
    responses: {
      200: jsonResponse(ModelAuditSchemas.Scan.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      500: jsonResponse(ModelAuditSchemas.Scan.ErrorResponse),
    },
  });

  register({
    method: 'get',
    path: '/api/model-audit/scans',
    operationId: 'listModelAuditScans',
    tags: ['Model Audit'],
    summary: 'List persisted ModelAudit scans',
    request: {
      query: ModelAuditSchemas.ListScans.Query,
    },
    responses: {
      200: jsonResponse(ModelAuditSchemas.ListScans.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'get',
    path: '/api/model-audit/scans/latest',
    operationId: 'getLatestModelAuditScan',
    tags: ['Model Audit'],
    summary: 'Get the latest persisted ModelAudit scan',
    responses: {
      200: jsonResponse(ModelAuditSchemas.GetLatestScan.Response),
      404: jsonResponse(ErrorResponseSchema, 'No scans found'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'get',
    path: '/api/model-audit/scans/{id}',
    operationId: 'getModelAuditScan',
    tags: ['Model Audit'],
    summary: 'Get one persisted ModelAudit scan',
    request: {
      params: ModelAuditSchemas.GetScan.Params,
    },
    responses: {
      200: jsonResponse(ModelAuditSchemas.GetScan.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      404: jsonResponse(ErrorResponseSchema, 'Model scan not found'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'delete',
    path: '/api/model-audit/scans/{id}',
    operationId: 'deleteModelAuditScan',
    tags: ['Model Audit'],
    summary: 'Delete one persisted ModelAudit scan',
    request: {
      params: ModelAuditSchemas.DeleteScan.Params,
    },
    responses: {
      200: jsonResponse(ModelAuditSchemas.DeleteScan.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      404: jsonResponse(ErrorResponseSchema, 'Model scan not found'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'get',
    path: '/api/providers/config-status',
    operationId: 'getProviderConfigStatus',
    tags: ['Providers'],
    summary: 'Get provider config status',
    responses: {
      200: jsonResponse(ProviderSchemas.ConfigStatus.Response),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'post',
    path: '/api/providers/test',
    operationId: 'testProvider',
    tags: ['Providers'],
    summary: 'Test a provider configuration',
    request: {
      body: jsonBody(OpenApiTestProviderRequestSchema),
    },
    responses: {
      200: jsonResponse(ProviderSchemas.Test.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'post',
    path: '/api/providers/discover',
    operationId: 'discoverProviderTarget',
    tags: ['Providers'],
    summary: 'Discover target purpose from a provider',
    request: {
      body: jsonBody(OpenApiProviderOptionsWithIdSchema),
    },
    responses: {
      200: jsonResponse(ProviderSchemas.Discover.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'post',
    path: '/api/providers/http-generator',
    operationId: 'generateHttpProvider',
    tags: ['Providers'],
    summary: 'Generate HTTP provider config from examples',
    request: {
      body: jsonBody(ProviderSchemas.HttpGenerator.Request),
    },
    responses: {
      200: jsonResponse({}, 'Generated HTTP provider config'),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'post',
    path: '/api/providers/test-request-transform',
    operationId: 'testProviderRequestTransform',
    tags: ['Providers'],
    summary: 'Test an HTTP provider request transform',
    request: {
      body: jsonBody(ProviderSchemas.TestRequestTransform.Request),
    },
    responses: {
      200: jsonResponse(ProviderSchemas.TestRequestTransform.Response),
      400: jsonResponse(ErrorResponseSchema),
    },
  });

  register({
    method: 'post',
    path: '/api/providers/test-response-transform',
    operationId: 'testProviderResponseTransform',
    tags: ['Providers'],
    summary: 'Test an HTTP provider response transform',
    request: {
      body: jsonBody(ProviderSchemas.TestResponseTransform.Request),
    },
    responses: {
      200: jsonResponse(ProviderSchemas.TestResponseTransform.Response),
      400: jsonResponse(ErrorResponseSchema),
    },
  });

  register({
    method: 'post',
    path: '/api/providers/test-session',
    operationId: 'testProviderSession',
    tags: ['Providers'],
    summary: 'Test multi-turn provider session behavior',
    request: {
      body: jsonBody(OpenApiTestSessionRequestSchema),
    },
    responses: {
      200: jsonResponse(ProviderSchemas.TestSession.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'post',
    path: '/api/redteam/generate-test',
    operationId: 'generateRedteamTest',
    tags: ['Redteam'],
    summary: 'Generate one or more redteam test cases',
    request: {
      body: jsonBody(OpenApiTestCaseGenerationRequestSchema),
    },
    responses: {
      200: jsonResponse(RedteamSchemas.GenerateTest.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'post',
    path: '/api/redteam/run',
    operationId: 'runRedteam',
    tags: ['Redteam'],
    summary: 'Start a redteam run',
    request: {
      body: jsonBody(RedteamSchemas.Run.Request),
    },
    responses: {
      200: jsonResponse(RedteamSchemas.Run.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
    },
  });

  register({
    method: 'post',
    path: '/api/redteam/cancel',
    operationId: 'cancelRedteam',
    tags: ['Redteam'],
    summary: 'Cancel the running redteam job',
    responses: {
      200: jsonResponse(RedteamSchemas.Cancel.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
    },
  });

  register({
    method: 'post',
    path: '/api/redteam/{taskId}',
    operationId: 'runRedteamTask',
    tags: ['Redteam'],
    summary: 'Run a redteam setup task',
    request: {
      params: RedteamSchemas.Task.Params,
      body: jsonBody(RedteamSchemas.Task.Request),
    },
    responses: {
      200: jsonResponse({}, 'Task-specific JSON response'),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'get',
    path: '/api/redteam/status',
    operationId: 'getRedteamStatus',
    tags: ['Redteam'],
    summary: 'Get redteam job status',
    responses: {
      200: jsonResponse(RedteamSchemas.Status.Response),
    },
  });

  register({
    method: 'get',
    path: '/api/traces/evaluation/{evaluationId}',
    operationId: 'getTracesByEvaluation',
    tags: ['Traces'],
    summary: 'List traces for an evaluation',
    request: {
      params: TracesSchemas.GetByEval.Params,
    },
    responses: {
      200: jsonResponse(TracesSchemas.GetByEval.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'get',
    path: '/api/traces/{traceId}',
    operationId: 'getTrace',
    tags: ['Traces'],
    summary: 'Get one trace',
    request: {
      params: TracesSchemas.Get.Params,
    },
    responses: {
      200: jsonResponse(TracesSchemas.Get.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      404: jsonResponse(ErrorResponseSchema, 'Trace not found'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'get',
    path: '/api/user/email',
    operationId: 'getUserEmail',
    tags: ['User'],
    summary: 'Get configured user email',
    responses: {
      200: jsonResponse(UserSchemas.Get.Response),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'get',
    path: '/api/user/id',
    operationId: 'getUserId',
    tags: ['User'],
    summary: 'Get local user ID',
    responses: {
      200: jsonResponse(UserSchemas.GetId.Response),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'post',
    path: '/api/user/email',
    operationId: 'updateUserEmail',
    tags: ['User'],
    summary: 'Update configured user email',
    request: {
      body: jsonBody(UserSchemas.Update.Request),
    },
    responses: {
      200: jsonResponse(UserSchemas.Update.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'put',
    path: '/api/user/email/clear',
    operationId: 'clearUserEmail',
    tags: ['User'],
    summary: 'Clear configured user email',
    responses: {
      200: jsonResponse(UserSchemas.ClearEmail.Response),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'get',
    path: '/api/user/email/status',
    operationId: 'getUserEmailStatus',
    tags: ['User'],
    summary: 'Get configured user email status',
    request: {
      query: UserSchemas.EmailStatus.Query,
    },
    responses: {
      200: jsonResponse(UserSchemas.EmailStatus.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'post',
    path: '/api/user/login',
    operationId: 'loginUser',
    tags: ['User'],
    summary: 'Authenticate with Promptfoo Cloud',
    request: {
      body: jsonBody(UserSchemas.Login.Request),
    },
    responses: {
      200: jsonResponse(UserSchemas.Login.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      401: jsonResponse(ErrorResponseSchema, 'Authentication failed'),
    },
  });

  register({
    method: 'post',
    path: '/api/user/logout',
    operationId: 'logoutUser',
    tags: ['User'],
    summary: 'Clear Promptfoo Cloud authentication',
    responses: {
      200: jsonResponse(UserSchemas.Logout.Response),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'get',
    path: '/api/user/cloud-config',
    operationId: 'getUserCloudConfig',
    tags: ['User'],
    summary: 'Get Promptfoo Cloud app config',
    responses: {
      200: jsonResponse(UserSchemas.CloudConfig.Response),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'get',
    path: '/api/version',
    operationId: 'getVersion',
    tags: ['Version'],
    summary: 'Check Promptfoo version and update commands',
    responses: {
      200: jsonResponse(VersionSchemas.Response),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'get',
    path: '/api/blobs/library',
    operationId: 'listMediaLibrary',
    tags: ['Blobs'],
    summary: 'List media items from blob storage',
    request: {
      query: BlobsSchemas.Library.Query,
    },
    responses: {
      200: jsonResponse(BlobsSchemas.Library.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'get',
    path: '/api/blobs/library/evals',
    operationId: 'listMediaLibraryEvals',
    tags: ['Blobs'],
    summary: 'List evaluations that have blob-backed media',
    request: {
      query: BlobsSchemas.LibraryEvals.Query,
    },
    responses: {
      200: jsonResponse(BlobsSchemas.LibraryEvals.Response),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  register({
    method: 'get',
    path: '/api/blobs/{hash}',
    operationId: 'getBlob',
    tags: ['Blobs'],
    summary: 'Fetch blob bytes or redirect to blob storage',
    request: {
      params: BlobsSchemas.Get.Params,
    },
    responses: {
      200: binaryResponse('Blob bytes'),
      302: redirectResponse('Presigned blob URL redirect'),
      400: jsonResponse(ErrorResponseSchema, 'Validation error'),
      403: jsonResponse(ErrorResponseSchema, 'Not authorized to access this blob'),
      404: jsonResponse(ErrorResponseSchema, 'Blob not found'),
      500: jsonResponse(ErrorResponseSchema, 'Server error'),
    },
  });

  return { registry, routes };
}

export function createServerOpenApiDocument() {
  const { registry } = createServerOpenApiRegistry();
  const generator = new OpenApiGeneratorV31(registry.definitions, {
    sortComponents: 'alphabetically',
    unionPreferredType: 'oneOf',
  });

  return generator.generateDocument({
    openapi: SERVER_OPENAPI_VERSION,
    info: {
      title: 'Promptfoo Local Server API',
      version: VERSION,
      description:
        'OpenAPI document generated from the shared Zod DTO schemas used by the Promptfoo local server and web UI.',
    },
    servers: [
      {
        url: 'http://localhost:15500',
        description: 'Default local Promptfoo server',
      },
    ],
  });
}
