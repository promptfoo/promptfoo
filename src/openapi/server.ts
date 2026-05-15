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
import { ProviderSchemas } from '../types/api/providers';
import { RedteamSchemas } from '../types/api/redteam';
import { ServerSchemas } from '../types/api/server';
import { TracesSchemas } from '../types/api/traces';
import { UserSchemas } from '../types/api/user';
import { VersionSchemas } from '../types/api/version';

extendZodWithOpenApi(z);

const APPLICATION_JSON = 'application/json';
const TEXT_CSV = 'text/csv';
const SERVER_OPENAPI_VERSION = '3.1.0';

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

const OpenApiEvalTableJsonResponseSchema = z.union([
  EvalSchemas.Table.Response,
  EvalSchemas.Table.JsonExportResponse,
]);

export const SERVER_OPENAPI_ROUTE_COUNT = 67;

type OpenApiSchema = ZodMediaTypeObject['schema'];
type RouteRequest = NonNullable<RouteConfig['request']>;
type RegisteredRouteConfig = RouteConfig & {
  operationId: string;
  tags: string[];
};

export function createServerOpenApiRegistry() {
  const registry = new OpenAPIRegistry();
  const routes: RegisteredRouteConfig[] = [];

  function schema<T extends z.ZodType>(_name: string, zodSchema: T): T {
    // The DTO schemas are created before this generator runs. Passing them directly
    // keeps @asteasolutions/zod-to-openapi isolated to docs generation instead of
    // importing it from runtime validation modules just to attach `.openapi()`.
    return zodSchema;
  }

  function params<T extends RouteRequest['params']>(name: string, zodSchema: T): T {
    return schema(name, zodSchema as z.ZodType) as T;
  }

  function query<T extends RouteRequest['query']>(name: string, zodSchema: T): T {
    return schema(name, zodSchema as z.ZodType) as T;
  }

  function jsonBody(name: string, zodSchema: z.ZodType, description = 'JSON request body') {
    return {
      description,
      required: true,
      content: {
        [APPLICATION_JSON]: {
          schema: schema(name, zodSchema),
        },
      },
    };
  }

  function jsonResponse(
    name: string,
    zodSchema: z.ZodType,
    description = 'Successful response',
  ): ResponseConfig {
    return {
      description,
      content: {
        [APPLICATION_JSON]: {
          schema: schema(name, zodSchema),
        },
      },
    };
  }

  function evalTableResponse(): ResponseConfig {
    return {
      description:
        'Evaluation table data. `format=json` returns an exported table object and `format=csv` returns CSV.',
      content: {
        [APPLICATION_JSON]: {
          schema: schema('EvalTableJsonResponse', OpenApiEvalTableJsonResponseSchema),
        },
        [TEXT_CSV]: {
          schema: {
            type: 'string',
          },
        },
      },
    };
  }

  function rawJsonResponse(description: string, openApiSchema: OpenApiSchema): ResponseConfig {
    return {
      description,
      content: {
        [APPLICATION_JSON]: {
          schema: openApiSchema,
        },
      },
    };
  }

  function errorResponse(description: string): ResponseConfig {
    return jsonResponse('ErrorResponse', ErrorResponseSchema, description);
  }

  function validationError() {
    return errorResponse('Validation error');
  }

  function notFound(description = 'Resource not found') {
    return errorResponse(description);
  }

  function serverError() {
    return errorResponse('Server error');
  }

  function noContent(description = 'No content'): ResponseConfig {
    return { description };
  }

  function binaryResponse(description: string): ResponseConfig {
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

  function redirectResponse(description: string): ResponseConfig {
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
      200: jsonResponse('HealthResponse', ServerSchemas.Health.Response),
    },
  });

  register({
    method: 'get',
    path: '/api/remote-health',
    operationId: 'getRemoteHealth',
    tags: ['Health'],
    summary: 'Check remote generation health',
    responses: {
      200: jsonResponse('RemoteHealthResponse', ServerSchemas.RemoteHealth.Response),
    },
  });

  register({
    method: 'get',
    path: '/api/results',
    operationId: 'listResults',
    tags: ['Results'],
    summary: 'List evaluation result summaries',
    request: {
      query: query('ListResultsQuery', ServerSchemas.ResultList.Query),
    },
    responses: {
      200: jsonResponse('ListResultsResponse', ServerSchemas.ResultList.Response),
      400: validationError(),
    },
  });

  register({
    method: 'get',
    path: '/api/results/{id}',
    operationId: 'getResult',
    tags: ['Results'],
    summary: 'Get one evaluation result',
    request: {
      params: params('ResultParams', ServerSchemas.Result.Params),
    },
    responses: {
      200: jsonResponse('ResultResponse', ServerSchemas.Result.Response),
      400: validationError(),
      404: notFound('Result not found'),
    },
  });

  register({
    method: 'get',
    path: '/api/prompts',
    operationId: 'listPrompts',
    tags: ['Prompts'],
    summary: 'List known prompts',
    responses: {
      200: jsonResponse('PromptsResponse', ServerSchemas.Prompts.Response),
    },
  });

  register({
    method: 'get',
    path: '/api/history',
    operationId: 'listHistory',
    tags: ['Results'],
    summary: 'List standalone evaluation history',
    request: {
      query: query('HistoryQuery', ServerSchemas.History.Query),
    },
    responses: {
      200: jsonResponse('HistoryResponse', ServerSchemas.History.Response),
      400: validationError(),
    },
  });

  register({
    method: 'get',
    path: '/api/prompts/{sha256hash}',
    operationId: 'getPromptByHash',
    tags: ['Prompts'],
    summary: 'Get prompts for a test-case hash',
    request: {
      params: params('PromptHashParams', ServerSchemas.Prompt.Params),
    },
    responses: {
      200: jsonResponse('PromptResponse', ServerSchemas.Prompt.Response),
      400: validationError(),
    },
  });

  register({
    method: 'get',
    path: '/api/datasets',
    operationId: 'listDatasets',
    tags: ['Datasets'],
    summary: 'List known datasets',
    responses: {
      200: jsonResponse('DatasetsResponse', ServerSchemas.Datasets.Response),
    },
  });

  register({
    method: 'get',
    path: '/api/results/share/check-domain',
    operationId: 'checkShareDomain',
    tags: ['Sharing'],
    summary: 'Check where an evaluation will be shared',
    request: {
      query: query('ShareCheckDomainQuery', ServerSchemas.ShareCheckDomain.Query),
    },
    responses: {
      200: jsonResponse('ShareCheckDomainResponse', ServerSchemas.ShareCheckDomain.Response),
      400: validationError(),
      404: notFound('Evaluation not found'),
    },
  });

  register({
    method: 'post',
    path: '/api/results/share',
    operationId: 'shareResult',
    tags: ['Sharing'],
    summary: 'Create a shareable evaluation URL',
    request: {
      body: jsonBody('ShareRequest', ServerSchemas.Share.Request),
    },
    responses: {
      200: jsonResponse('ShareResponse', ServerSchemas.Share.Response),
      400: validationError(),
      404: notFound('Evaluation not found'),
      500: serverError(),
    },
  });

  register({
    method: 'post',
    path: '/api/dataset/generate',
    operationId: 'generateDataset',
    tags: ['Datasets'],
    summary: 'Generate synthetic dataset rows',
    request: {
      body: jsonBody('DatasetGenerateRequest', ServerSchemas.DatasetGenerate.Request),
    },
    responses: {
      200: jsonResponse('DatasetGenerateResponse', ServerSchemas.DatasetGenerate.Response),
      400: validationError(),
    },
  });

  register({
    method: 'post',
    path: '/api/telemetry',
    operationId: 'recordTelemetry',
    tags: ['Telemetry'],
    summary: 'Record a web UI telemetry event',
    request: {
      body: jsonBody('TelemetryEvent', ServerSchemas.Telemetry.Request),
    },
    responses: {
      200: jsonResponse('TelemetryResponse', ServerSchemas.Telemetry.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  register({
    method: 'get',
    path: '/api/configs',
    operationId: 'listConfigs',
    tags: ['Configs'],
    summary: 'List stored configs',
    request: {
      query: query('ListConfigsQuery', ConfigSchemas.List.Query),
    },
    responses: {
      200: jsonResponse('ListConfigsResponse', ConfigSchemas.List.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  register({
    method: 'post',
    path: '/api/configs',
    operationId: 'createConfig',
    tags: ['Configs'],
    summary: 'Create a stored config',
    request: {
      body: jsonBody('CreateConfigRequest', ConfigSchemas.Create.Request),
    },
    responses: {
      200: jsonResponse('CreateConfigResponse', ConfigSchemas.Create.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  register({
    method: 'get',
    path: '/api/configs/{type}',
    operationId: 'listConfigsByType',
    tags: ['Configs'],
    summary: 'List stored configs by type',
    request: {
      params: params('ListConfigsByTypeParams', ConfigSchemas.ListByType.Params),
    },
    responses: {
      200: jsonResponse('ListConfigsByTypeResponse', ConfigSchemas.ListByType.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  register({
    method: 'get',
    path: '/api/configs/{type}/{id}',
    operationId: 'getConfig',
    tags: ['Configs'],
    summary: 'Get a stored config',
    request: {
      params: params('GetConfigParams', ConfigSchemas.Get.Params),
    },
    responses: {
      200: jsonResponse('GetConfigResponse', ConfigSchemas.Get.Response),
      400: validationError(),
      404: notFound('Config not found'),
      500: serverError(),
    },
  });

  register({
    method: 'post',
    path: '/api/eval/job',
    operationId: 'createEvalJob',
    tags: ['Eval'],
    summary: 'Start an evaluation job',
    request: {
      body: jsonBody('CreateJobRequest', OpenApiCreateJobRequestSchema),
    },
    responses: {
      200: jsonResponse('CreateJobResponse', EvalSchemas.CreateJob.Response),
      400: validationError(),
    },
  });

  register({
    method: 'get',
    path: '/api/eval/job/{id}',
    operationId: 'getEvalJob',
    tags: ['Eval'],
    summary: 'Get evaluation job status',
    request: {
      params: params('GetJobParams', EvalSchemas.GetJob.Params),
    },
    responses: {
      200: jsonResponse('GetJobResponse', EvalSchemas.GetJob.Response),
      400: validationError(),
      404: notFound('Job not found'),
    },
  });

  register({
    method: 'patch',
    path: '/api/eval/{id}',
    operationId: 'updateEval',
    tags: ['Eval'],
    summary: 'Update an evaluation table or config',
    request: {
      params: params('UpdateEvalParams', EvalSchemas.Update.Params),
      body: jsonBody('UpdateEvalRequest', EvalSchemas.Update.Request),
    },
    responses: {
      200: jsonResponse('UpdateEvalResponse', EvalSchemas.Update.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  register({
    method: 'patch',
    path: '/api/eval/{id}/author',
    operationId: 'updateEvalAuthor',
    tags: ['Eval'],
    summary: 'Update evaluation author',
    request: {
      params: params('UpdateEvalAuthorParams', EvalSchemas.UpdateAuthor.Params),
      body: jsonBody('UpdateEvalAuthorRequest', EvalSchemas.UpdateAuthor.Request),
    },
    responses: {
      200: jsonResponse('UpdateEvalAuthorResponse', EvalSchemas.UpdateAuthor.Response),
      400: validationError(),
      404: notFound('Evaluation not found'),
      500: serverError(),
    },
  });

  register({
    method: 'get',
    path: '/api/eval/{id}/table',
    operationId: 'getEvalTable',
    tags: ['Eval'],
    summary: 'Get evaluation table data',
    request: {
      params: params('EvalTableParams', EvalSchemas.Table.Params),
      query: query('EvalTableQuery', EvalSchemas.Table.Query),
    },
    responses: {
      200: evalTableResponse(),
      400: validationError(),
      404: notFound('Evaluation not found'),
      500: serverError(),
      413: errorResponse('Evaluation table is too large'),
    },
  });

  register({
    method: 'get',
    path: '/api/eval/{id}/metadata-keys',
    operationId: 'getEvalMetadataKeys',
    tags: ['Eval'],
    summary: 'List metadata keys for an evaluation',
    request: {
      params: params('GetMetadataKeysParams', EvalSchemas.MetadataKeys.Params),
      query: query('GetMetadataKeysQuery', EvalSchemas.MetadataKeys.Query),
    },
    responses: {
      200: jsonResponse('GetMetadataKeysResponse', EvalSchemas.MetadataKeys.Response),
      400: validationError(),
      404: notFound('Evaluation not found'),
      500: serverError(),
    },
  });

  register({
    method: 'get',
    path: '/api/eval/{id}/metadata-values',
    operationId: 'getEvalMetadataValues',
    tags: ['Eval'],
    summary: 'List metadata values for one key',
    request: {
      params: params('GetMetadataValuesParams', EvalSchemas.MetadataValues.Params),
      query: query('GetMetadataValuesQuery', EvalSchemas.MetadataValues.Query),
    },
    responses: {
      200: jsonResponse('GetMetadataValuesResponse', EvalSchemas.MetadataValues.Response),
      400: validationError(),
      404: notFound('Evaluation not found'),
      500: serverError(),
    },
  });

  register({
    method: 'post',
    path: '/api/eval/{id}/results',
    operationId: 'addEvalResults',
    tags: ['Eval'],
    summary: 'Append results to an evaluation',
    request: {
      params: params('AddResultsParams', EvalSchemas.AddResults.Params),
      body: jsonBody('AddResultsRequest', EvalSchemas.AddResults.Request),
    },
    responses: {
      204: noContent('Results added'),
      400: validationError(),
      404: notFound('Evaluation not found'),
      500: serverError(),
    },
  });

  register({
    method: 'post',
    path: '/api/eval/replay',
    operationId: 'replayEval',
    tags: ['Eval'],
    summary: 'Replay one evaluation test',
    request: {
      body: jsonBody('ReplayRequest', EvalSchemas.Replay.Request),
    },
    responses: {
      200: jsonResponse('ReplayResponse', EvalSchemas.Replay.Response),
      400: validationError(),
      404: notFound('Evaluation not found'),
      500: serverError(),
    },
  });

  register({
    method: 'post',
    path: '/api/eval/{evalId}/results/{id}/rating',
    operationId: 'submitEvalResultRating',
    tags: ['Eval'],
    summary: 'Submit a rating for one result',
    request: {
      params: params('SubmitRatingParams', EvalSchemas.SubmitRating.Params),
      body: jsonBody('SubmitRatingRequest', EvalSchemas.SubmitRating.Request),
    },
    responses: {
      200: jsonResponse('SubmitRatingResponse', EvalSchemas.SubmitRating.Response),
      400: validationError(),
      404: notFound('Result or evaluation not found'),
      500: serverError(),
    },
  });

  register({
    method: 'post',
    path: '/api/eval',
    operationId: 'saveEval',
    tags: ['Eval'],
    summary: 'Save an evaluation result',
    request: {
      body: jsonBody('SaveEvalRequest', EvalSchemas.Save.Request),
    },
    responses: {
      200: jsonResponse('SaveEvalResponse', EvalSchemas.Save.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  register({
    method: 'delete',
    path: '/api/eval/{id}',
    operationId: 'deleteEval',
    tags: ['Eval'],
    summary: 'Delete one evaluation',
    request: {
      params: params('DeleteEvalParams', EvalSchemas.Delete.Params),
    },
    responses: {
      200: jsonResponse('DeleteEvalResponse', EvalSchemas.Delete.Response),
      400: validationError(),
      404: notFound('Evaluation not found'),
      500: serverError(),
    },
  });

  register({
    method: 'delete',
    path: '/api/eval',
    operationId: 'bulkDeleteEvals',
    tags: ['Eval'],
    summary: 'Delete multiple evaluations',
    request: {
      body: jsonBody('BulkDeleteEvalsRequest', EvalSchemas.BulkDelete.Request),
    },
    responses: {
      204: noContent('Evaluations deleted'),
      400: validationError(),
      500: serverError(),
    },
  });

  register({
    method: 'post',
    path: '/api/eval/{id}/copy',
    operationId: 'copyEval',
    tags: ['Eval'],
    summary: 'Copy an evaluation',
    request: {
      params: params('CopyEvalParams', EvalSchemas.Copy.Params),
      body: jsonBody('CopyEvalRequest', EvalSchemas.Copy.Request),
    },
    responses: {
      201: jsonResponse('CopyEvalResponse', EvalSchemas.Copy.Response, 'Evaluation copied'),
      400: validationError(),
      404: notFound('Evaluation not found'),
      500: serverError(),
    },
  });

  register({
    method: 'get',
    path: '/api/media/stats',
    operationId: 'getMediaStats',
    tags: ['Media'],
    summary: 'Get media storage stats',
    responses: {
      200: jsonResponse('MediaStatsResponse', MediaSchemas.Stats.Response),
      500: serverError(),
    },
  });

  register({
    method: 'get',
    path: '/api/media/info/{type}/{filename}',
    operationId: 'getMediaInfo',
    tags: ['Media'],
    summary: 'Get media file metadata',
    request: {
      params: params('MediaInfoParams', MediaSchemas.Info.Params),
    },
    responses: {
      200: jsonResponse('MediaInfoResponse', MediaSchemas.Info.Response),
      400: validationError(),
      404: notFound('Media not found'),
      500: serverError(),
    },
  });

  register({
    method: 'get',
    path: '/api/media/{type}/{filename}',
    operationId: 'getMedia',
    tags: ['Media'],
    summary: 'Fetch media file bytes',
    request: {
      params: params('MediaParams', MediaSchemas.Get.Params),
    },
    responses: {
      200: binaryResponse('Media bytes'),
      400: validationError(),
      404: notFound('Media not found'),
      500: serverError(),
    },
  });

  register({
    method: 'get',
    path: '/api/model-audit/check-installed',
    operationId: 'checkModelAuditInstalled',
    tags: ['Model Audit'],
    summary: 'Check whether ModelAudit is installed',
    responses: {
      200: jsonResponse('CheckInstalledResponse', ModelAuditSchemas.CheckInstalled.Response),
    },
  });

  register({
    method: 'get',
    path: '/api/model-audit/scanners',
    operationId: 'listModelAuditScanners',
    tags: ['Model Audit'],
    summary: 'List available ModelAudit scanners',
    responses: {
      200: jsonResponse('ListScannersResponse', ModelAuditSchemas.ListScanners.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  register({
    method: 'post',
    path: '/api/model-audit/check-path',
    operationId: 'checkModelAuditPath',
    tags: ['Model Audit'],
    summary: 'Check whether a filesystem path exists',
    request: {
      body: jsonBody('CheckPathRequest', ModelAuditSchemas.CheckPath.Request),
    },
    responses: {
      200: jsonResponse('CheckPathResponse', ModelAuditSchemas.CheckPath.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  register({
    method: 'post',
    path: '/api/model-audit/scan',
    operationId: 'runModelAuditScan',
    tags: ['Model Audit'],
    summary: 'Run a ModelAudit scan',
    request: {
      body: jsonBody('ScanRequest', ModelAuditSchemas.Scan.Request),
    },
    responses: {
      200: jsonResponse('ScanResponse', ModelAuditSchemas.Scan.Response),
      400: validationError(),
      500: jsonResponse('ScanErrorResponse', ModelAuditSchemas.Scan.ErrorResponse),
    },
  });

  register({
    method: 'get',
    path: '/api/model-audit/scans',
    operationId: 'listModelAuditScans',
    tags: ['Model Audit'],
    summary: 'List persisted ModelAudit scans',
    request: {
      query: query('ListScansQuery', ModelAuditSchemas.ListScans.Query),
    },
    responses: {
      200: jsonResponse('ListScansResponse', ModelAuditSchemas.ListScans.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  register({
    method: 'get',
    path: '/api/model-audit/scans/latest',
    operationId: 'getLatestModelAuditScan',
    tags: ['Model Audit'],
    summary: 'Get the latest persisted ModelAudit scan',
    responses: {
      200: jsonResponse('GetLatestScanResponse', ModelAuditSchemas.GetLatestScan.Response),
      404: notFound('No scans found'),
      500: serverError(),
    },
  });

  register({
    method: 'get',
    path: '/api/model-audit/scans/{id}',
    operationId: 'getModelAuditScan',
    tags: ['Model Audit'],
    summary: 'Get one persisted ModelAudit scan',
    request: {
      params: params('GetScanParams', ModelAuditSchemas.GetScan.Params),
    },
    responses: {
      200: jsonResponse('GetScanResponse', ModelAuditSchemas.GetScan.Response),
      400: validationError(),
      404: notFound('Model scan not found'),
      500: serverError(),
    },
  });

  register({
    method: 'delete',
    path: '/api/model-audit/scans/{id}',
    operationId: 'deleteModelAuditScan',
    tags: ['Model Audit'],
    summary: 'Delete one persisted ModelAudit scan',
    request: {
      params: params('DeleteScanParams', ModelAuditSchemas.DeleteScan.Params),
    },
    responses: {
      200: jsonResponse('DeleteScanResponse', ModelAuditSchemas.DeleteScan.Response),
      400: validationError(),
      404: notFound('Model scan not found'),
      500: serverError(),
    },
  });

  register({
    method: 'get',
    path: '/api/providers/config-status',
    operationId: 'getProviderConfigStatus',
    tags: ['Providers'],
    summary: 'Get provider config status',
    responses: {
      200: jsonResponse('ConfigStatusResponse', ProviderSchemas.ConfigStatus.Response),
      500: serverError(),
    },
  });

  register({
    method: 'post',
    path: '/api/providers/test',
    operationId: 'testProvider',
    tags: ['Providers'],
    summary: 'Test a provider configuration',
    request: {
      body: jsonBody('TestProviderRequest', OpenApiTestProviderRequestSchema),
    },
    responses: {
      200: jsonResponse('TestProviderResponse', ProviderSchemas.Test.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  register({
    method: 'post',
    path: '/api/providers/discover',
    operationId: 'discoverProviderTarget',
    tags: ['Providers'],
    summary: 'Discover target purpose from a provider',
    request: {
      body: jsonBody('DiscoverRequest', OpenApiProviderOptionsWithIdSchema),
    },
    responses: {
      200: jsonResponse('DiscoverResponse', ProviderSchemas.Discover.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  register({
    method: 'post',
    path: '/api/providers/http-generator',
    operationId: 'generateHttpProvider',
    tags: ['Providers'],
    summary: 'Generate HTTP provider config from examples',
    request: {
      body: jsonBody('HttpGeneratorRequest', ProviderSchemas.HttpGenerator.Request),
    },
    responses: {
      200: rawJsonResponse('Generated HTTP provider config', {}),
      400: validationError(),
      500: serverError(),
    },
  });

  register({
    method: 'post',
    path: '/api/providers/test-request-transform',
    operationId: 'testProviderRequestTransform',
    tags: ['Providers'],
    summary: 'Test an HTTP provider request transform',
    request: {
      body: jsonBody('TestRequestTransformRequest', ProviderSchemas.TestRequestTransform.Request),
    },
    responses: {
      200: jsonResponse(
        'TestRequestTransformResponse',
        ProviderSchemas.TestRequestTransform.Response,
      ),
      400: jsonResponse('ProviderTransformErrorResponse', ErrorResponseSchema),
    },
  });

  register({
    method: 'post',
    path: '/api/providers/test-response-transform',
    operationId: 'testProviderResponseTransform',
    tags: ['Providers'],
    summary: 'Test an HTTP provider response transform',
    request: {
      body: jsonBody('TestResponseTransformRequest', ProviderSchemas.TestResponseTransform.Request),
    },
    responses: {
      200: jsonResponse(
        'TestResponseTransformResponse',
        ProviderSchemas.TestResponseTransform.Response,
      ),
      400: jsonResponse('ProviderTransformErrorResponse', ErrorResponseSchema),
    },
  });

  register({
    method: 'post',
    path: '/api/providers/test-session',
    operationId: 'testProviderSession',
    tags: ['Providers'],
    summary: 'Test multi-turn provider session behavior',
    request: {
      body: jsonBody('TestSessionRequest', OpenApiTestSessionRequestSchema),
    },
    responses: {
      200: jsonResponse('TestSessionResponse', ProviderSchemas.TestSession.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  register({
    method: 'post',
    path: '/api/redteam/generate-test',
    operationId: 'generateRedteamTest',
    tags: ['Redteam'],
    summary: 'Generate one or more redteam test cases',
    request: {
      body: jsonBody('TestCaseGenerationRequest', RedteamSchemas.GenerateTest.Request),
    },
    responses: {
      200: jsonResponse('TestCaseGenerationResponse', RedteamSchemas.GenerateTest.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  register({
    method: 'post',
    path: '/api/redteam/run',
    operationId: 'runRedteam',
    tags: ['Redteam'],
    summary: 'Start a redteam run',
    request: {
      body: jsonBody('RedteamRunRequest', RedteamSchemas.Run.Request),
    },
    responses: {
      200: jsonResponse('RedteamRunResponse', RedteamSchemas.Run.Response),
      400: validationError(),
    },
  });

  register({
    method: 'post',
    path: '/api/redteam/cancel',
    operationId: 'cancelRedteam',
    tags: ['Redteam'],
    summary: 'Cancel the running redteam job',
    responses: {
      200: jsonResponse('RedteamCancelResponse', RedteamSchemas.Cancel.Response),
      400: validationError(),
    },
  });

  register({
    method: 'post',
    path: '/api/redteam/{taskId}',
    operationId: 'runRedteamTask',
    tags: ['Redteam'],
    summary: 'Run a redteam setup task',
    request: {
      params: params('RedteamTaskParams', RedteamSchemas.Task.Params),
      body: jsonBody('RedteamTaskRequest', RedteamSchemas.Task.Request),
    },
    responses: {
      200: rawJsonResponse('Task-specific JSON response', {}),
      400: validationError(),
      500: serverError(),
    },
  });

  register({
    method: 'get',
    path: '/api/redteam/status',
    operationId: 'getRedteamStatus',
    tags: ['Redteam'],
    summary: 'Get redteam job status',
    responses: {
      200: jsonResponse('RedteamStatusResponse', RedteamSchemas.Status.Response),
    },
  });

  register({
    method: 'get',
    path: '/api/traces/evaluation/{evaluationId}',
    operationId: 'getTracesByEvaluation',
    tags: ['Traces'],
    summary: 'List traces for an evaluation',
    request: {
      params: params('GetTracesByEvalParams', TracesSchemas.GetByEval.Params),
    },
    responses: {
      200: jsonResponse('GetTracesByEvalResponse', TracesSchemas.GetByEval.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  register({
    method: 'get',
    path: '/api/traces/{traceId}',
    operationId: 'getTrace',
    tags: ['Traces'],
    summary: 'Get one trace',
    request: {
      params: params('GetTraceParams', TracesSchemas.Get.Params),
    },
    responses: {
      200: jsonResponse('GetTraceResponse', TracesSchemas.Get.Response),
      400: validationError(),
      404: notFound('Trace not found'),
      500: serverError(),
    },
  });

  register({
    method: 'get',
    path: '/api/user/email',
    operationId: 'getUserEmail',
    tags: ['User'],
    summary: 'Get configured user email',
    responses: {
      200: jsonResponse('GetUserResponse', UserSchemas.Get.Response),
      500: serverError(),
    },
  });

  register({
    method: 'get',
    path: '/api/user/id',
    operationId: 'getUserId',
    tags: ['User'],
    summary: 'Get local user ID',
    responses: {
      200: jsonResponse('GetUserIdResponse', UserSchemas.GetId.Response),
      500: serverError(),
    },
  });

  register({
    method: 'post',
    path: '/api/user/email',
    operationId: 'updateUserEmail',
    tags: ['User'],
    summary: 'Update configured user email',
    request: {
      body: jsonBody('UpdateUserRequest', UserSchemas.Update.Request),
    },
    responses: {
      200: jsonResponse('UpdateUserResponse', UserSchemas.Update.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  register({
    method: 'put',
    path: '/api/user/email/clear',
    operationId: 'clearUserEmail',
    tags: ['User'],
    summary: 'Clear configured user email',
    responses: {
      200: jsonResponse('ClearUserEmailResponse', UserSchemas.ClearEmail.Response),
      500: serverError(),
    },
  });

  register({
    method: 'get',
    path: '/api/user/email/status',
    operationId: 'getUserEmailStatus',
    tags: ['User'],
    summary: 'Get configured user email status',
    request: {
      query: query('GetEmailStatusQuery', UserSchemas.EmailStatus.Query),
    },
    responses: {
      200: jsonResponse('GetEmailStatusResponse', UserSchemas.EmailStatus.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  register({
    method: 'post',
    path: '/api/user/login',
    operationId: 'loginUser',
    tags: ['User'],
    summary: 'Authenticate with Promptfoo Cloud',
    request: {
      body: jsonBody('LoginRequest', UserSchemas.Login.Request),
    },
    responses: {
      200: jsonResponse('LoginResponse', UserSchemas.Login.Response),
      400: validationError(),
      401: errorResponse('Authentication failed'),
    },
  });

  register({
    method: 'post',
    path: '/api/user/logout',
    operationId: 'logoutUser',
    tags: ['User'],
    summary: 'Clear Promptfoo Cloud authentication',
    responses: {
      200: jsonResponse('LogoutResponse', UserSchemas.Logout.Response),
      500: serverError(),
    },
  });

  register({
    method: 'get',
    path: '/api/user/cloud-config',
    operationId: 'getUserCloudConfig',
    tags: ['User'],
    summary: 'Get Promptfoo Cloud app config',
    responses: {
      200: jsonResponse('CloudConfigResponse', UserSchemas.CloudConfig.Response),
      500: serverError(),
    },
  });

  register({
    method: 'get',
    path: '/api/version',
    operationId: 'getVersion',
    tags: ['Version'],
    summary: 'Check Promptfoo version and update commands',
    responses: {
      200: jsonResponse('VersionResponse', VersionSchemas.Response),
      500: serverError(),
    },
  });

  register({
    method: 'get',
    path: '/api/blobs/library',
    operationId: 'listMediaLibrary',
    tags: ['Blobs'],
    summary: 'List media items from blob storage',
    request: {
      query: query('MediaLibraryQuery', BlobsSchemas.Library.Query),
    },
    responses: {
      200: jsonResponse('MediaLibraryResponse', BlobsSchemas.Library.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  register({
    method: 'get',
    path: '/api/blobs/library/evals',
    operationId: 'listMediaLibraryEvals',
    tags: ['Blobs'],
    summary: 'List evaluations that have blob-backed media',
    request: {
      query: query('MediaLibraryEvalsQuery', BlobsSchemas.LibraryEvals.Query),
    },
    responses: {
      200: jsonResponse('MediaLibraryEvalsResponse', BlobsSchemas.LibraryEvals.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  register({
    method: 'get',
    path: '/api/blobs/{hash}',
    operationId: 'getBlob',
    tags: ['Blobs'],
    summary: 'Fetch blob bytes or redirect to blob storage',
    request: {
      params: params('GetBlobParams', BlobsSchemas.Get.Params),
    },
    responses: {
      200: binaryResponse('Blob bytes'),
      302: redirectResponse('Presigned blob URL redirect'),
      400: validationError(),
      403: errorResponse('Not authorized to access this blob'),
      404: notFound('Blob not found'),
      500: serverError(),
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
