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
import { type ApiRouteContract, ApiRoutes } from '../types/api/routes';
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
    tests: z.union([z.string(), z.array(z.unknown()), OpenApiLooseObjectSchema]).optional(),
    evaluateOptions: OpenApiLooseObjectSchema.optional(),
    sourceEvalId: z.string().min(1).optional(),
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

export const SERVER_OPENAPI_ROUTE_COUNT = 68;

type OpenApiSchema = ZodMediaTypeObject['schema'];
type RouteRequest = NonNullable<RouteConfig['request']>;
type RegisteredRouteConfig = RouteConfig & {
  operationId: string;
  tags: string[];
};
type CreateServerOpenApiRegistryOptions = {
  version?: string;
};

export function createServerOpenApiRegistry({
  version = VERSION,
}: CreateServerOpenApiRegistryOptions = {}) {
  const registry = new OpenAPIRegistry();
  const routes: RegisteredRouteConfig[] = [];
  const telemetryEventSchema = ServerSchemas.Telemetry.Request.extend({
    packageVersion: z.string().optional().prefault(version),
  });

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

  function registerContract(
    contract: ApiRouteContract,
    config: Omit<RouteConfig, 'method' | 'path'>,
  ) {
    const unsafeMethodResponses: Record<string, ResponseConfig> =
      contract.method === 'get'
        ? {}
        : {
            400: validationError(),
            403: errorResponse('CSRF protection rejected request'),
          };

    register({
      method: contract.method,
      path: contract.openApiPath,
      operationId: contract.operationId,
      tags: [contract.tag],
      summary: contract.summary,
      ...config,
      responses: {
        ...unsafeMethodResponses,
        ...config.responses,
      },
    });
  }

  registerContract(ApiRoutes.Health, {
    responses: {
      200: jsonResponse('HealthResponse', ServerSchemas.Health.Response),
    },
  });

  registerContract(ApiRoutes.OpenApi, {
    description:
      'Returns the OpenAPI 3.1 description of the local server API generated from the same Zod DTOs that validate runtime requests and responses. Useful for client code generation and live introspection.',
    responses: {
      200: jsonResponse('OpenApiDocument', ServerSchemas.OpenApi.Response, 'OpenAPI 3.1 document'),
    },
  });

  registerContract(ApiRoutes.RemoteHealth, {
    responses: {
      200: jsonResponse('RemoteHealthResponse', ServerSchemas.RemoteHealth.Response),
    },
  });

  registerContract(ApiRoutes.Results.List, {
    request: {
      query: query('ListResultsQuery', ServerSchemas.ResultList.Query),
    },
    responses: {
      200: jsonResponse('ListResultsResponse', ServerSchemas.ResultList.Response),
      400: validationError(),
    },
  });

  registerContract(ApiRoutes.Results.Get, {
    request: {
      params: params('ResultParams', ServerSchemas.Result.Params),
    },
    responses: {
      200: jsonResponse('ResultResponse', ServerSchemas.Result.Response),
      400: validationError(),
      404: notFound('Result not found'),
    },
  });

  registerContract(ApiRoutes.Prompts.List, {
    responses: {
      200: jsonResponse('PromptsResponse', ServerSchemas.Prompts.Response),
    },
  });

  registerContract(ApiRoutes.History, {
    request: {
      query: query('HistoryQuery', ServerSchemas.History.Query),
    },
    responses: {
      200: jsonResponse('HistoryResponse', ServerSchemas.History.Response),
      400: validationError(),
    },
  });

  registerContract(ApiRoutes.Prompts.Get, {
    request: {
      params: params('PromptHashParams', ServerSchemas.Prompt.Params),
    },
    responses: {
      200: jsonResponse('PromptResponse', ServerSchemas.Prompt.Response),
      400: validationError(),
    },
  });

  registerContract(ApiRoutes.Datasets, {
    responses: {
      200: jsonResponse('DatasetsResponse', ServerSchemas.Datasets.Response),
    },
  });

  registerContract(ApiRoutes.Results.ShareCheckDomain, {
    request: {
      query: query('ShareCheckDomainQuery', ServerSchemas.ShareCheckDomain.Query),
    },
    responses: {
      200: jsonResponse('ShareCheckDomainResponse', ServerSchemas.ShareCheckDomain.Response),
      400: validationError(),
      404: notFound('Evaluation not found'),
    },
  });

  registerContract(ApiRoutes.Results.Share, {
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

  registerContract(ApiRoutes.DatasetGenerate, {
    request: {
      body: jsonBody('DatasetGenerateRequest', ServerSchemas.DatasetGenerate.Request),
    },
    responses: {
      200: jsonResponse('DatasetGenerateResponse', ServerSchemas.DatasetGenerate.Response),
      400: validationError(),
    },
  });

  registerContract(ApiRoutes.Telemetry, {
    request: {
      body: jsonBody('TelemetryEvent', telemetryEventSchema),
    },
    responses: {
      200: jsonResponse('TelemetryResponse', ServerSchemas.Telemetry.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Configs.List, {
    request: {
      query: query('ListConfigsQuery', ConfigSchemas.List.Query),
    },
    responses: {
      200: jsonResponse('ListConfigsResponse', ConfigSchemas.List.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Configs.Create, {
    request: {
      body: jsonBody('CreateConfigRequest', ConfigSchemas.Create.Request),
    },
    responses: {
      200: jsonResponse('CreateConfigResponse', ConfigSchemas.Create.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Configs.ListByType, {
    request: {
      params: params('ListConfigsByTypeParams', ConfigSchemas.ListByType.Params),
    },
    responses: {
      200: jsonResponse('ListConfigsByTypeResponse', ConfigSchemas.ListByType.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Configs.Get, {
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

  registerContract(ApiRoutes.Eval.CreateJob, {
    request: {
      body: jsonBody('CreateJobRequest', OpenApiCreateJobRequestSchema),
    },
    responses: {
      200: jsonResponse('CreateJobResponse', EvalSchemas.CreateJob.Response),
      400: validationError(),
    },
  });

  registerContract(ApiRoutes.Eval.GetJob, {
    request: {
      params: params('GetJobParams', EvalSchemas.GetJob.Params),
    },
    responses: {
      200: jsonResponse('GetJobResponse', EvalSchemas.GetJob.Response),
      400: validationError(),
      404: notFound('Job not found'),
    },
  });

  registerContract(ApiRoutes.Eval.Update, {
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

  registerContract(ApiRoutes.Eval.UpdateAuthor, {
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

  registerContract(ApiRoutes.Eval.Table, {
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

  registerContract(ApiRoutes.Eval.MetadataKeys, {
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

  registerContract(ApiRoutes.Eval.MetadataValues, {
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

  registerContract(ApiRoutes.Eval.AddResults, {
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

  registerContract(ApiRoutes.Eval.Replay, {
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

  registerContract(ApiRoutes.Eval.SubmitRating, {
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

  registerContract(ApiRoutes.Eval.Save, {
    request: {
      body: jsonBody('SaveEvalRequest', EvalSchemas.Save.Request),
    },
    responses: {
      200: jsonResponse('SaveEvalResponse', EvalSchemas.Save.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Eval.Delete, {
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

  registerContract(ApiRoutes.Eval.BulkDelete, {
    request: {
      body: jsonBody('BulkDeleteEvalsRequest', EvalSchemas.BulkDelete.Request),
    },
    responses: {
      204: noContent('Evaluations deleted'),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Eval.Copy, {
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

  registerContract(ApiRoutes.Media.Stats, {
    responses: {
      200: jsonResponse('MediaStatsResponse', MediaSchemas.Stats.Response),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Media.Info, {
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

  registerContract(ApiRoutes.Media.Get, {
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

  registerContract(ApiRoutes.ModelAudit.CheckInstalled, {
    responses: {
      200: jsonResponse('CheckInstalledResponse', ModelAuditSchemas.CheckInstalled.Response),
    },
  });

  registerContract(ApiRoutes.ModelAudit.ListScanners, {
    responses: {
      200: jsonResponse('ListScannersResponse', ModelAuditSchemas.ListScanners.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.ModelAudit.CheckPath, {
    request: {
      body: jsonBody('CheckPathRequest', ModelAuditSchemas.CheckPath.Request),
    },
    responses: {
      200: jsonResponse('CheckPathResponse', ModelAuditSchemas.CheckPath.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.ModelAudit.Scan, {
    request: {
      body: jsonBody('ScanRequest', ModelAuditSchemas.Scan.Request),
    },
    responses: {
      200: jsonResponse('ScanResponse', ModelAuditSchemas.Scan.Response),
      400: validationError(),
      500: jsonResponse('ScanErrorResponse', ModelAuditSchemas.Scan.ErrorResponse, 'Server error'),
    },
  });

  registerContract(ApiRoutes.ModelAudit.ListScans, {
    request: {
      query: query('ListScansQuery', ModelAuditSchemas.ListScans.Query),
    },
    responses: {
      200: jsonResponse('ListScansResponse', ModelAuditSchemas.ListScans.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.ModelAudit.GetLatestScan, {
    responses: {
      200: jsonResponse('GetLatestScanResponse', ModelAuditSchemas.GetLatestScan.Response),
      404: notFound('No scans found'),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.ModelAudit.GetScan, {
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

  registerContract(ApiRoutes.ModelAudit.DeleteScan, {
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

  registerContract(ApiRoutes.Providers.ConfigStatus, {
    responses: {
      200: jsonResponse('ConfigStatusResponse', ProviderSchemas.ConfigStatus.Response),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Providers.Test, {
    request: {
      body: jsonBody('TestProviderRequest', OpenApiTestProviderRequestSchema),
    },
    responses: {
      200: jsonResponse('TestProviderResponse', ProviderSchemas.Test.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Providers.Discover, {
    request: {
      body: jsonBody('DiscoverRequest', OpenApiProviderOptionsWithIdSchema),
    },
    responses: {
      200: jsonResponse('DiscoverResponse', ProviderSchemas.Discover.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Providers.HttpGenerator, {
    request: {
      body: jsonBody('HttpGeneratorRequest', ProviderSchemas.HttpGenerator.Request),
    },
    responses: {
      200: rawJsonResponse('Generated HTTP provider config', {}),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Providers.TestRequestTransform, {
    request: {
      body: jsonBody('TestRequestTransformRequest', ProviderSchemas.TestRequestTransform.Request),
    },
    responses: {
      200: jsonResponse(
        'TestRequestTransformResponse',
        ProviderSchemas.TestRequestTransform.Response,
      ),
      400: errorResponse('Validation error'),
    },
  });

  registerContract(ApiRoutes.Providers.TestResponseTransform, {
    request: {
      body: jsonBody('TestResponseTransformRequest', ProviderSchemas.TestResponseTransform.Request),
    },
    responses: {
      200: jsonResponse(
        'TestResponseTransformResponse',
        ProviderSchemas.TestResponseTransform.Response,
      ),
      400: errorResponse('Validation error'),
    },
  });

  registerContract(ApiRoutes.Providers.TestSession, {
    request: {
      body: jsonBody('TestSessionRequest', OpenApiTestSessionRequestSchema),
    },
    responses: {
      200: jsonResponse('TestSessionResponse', ProviderSchemas.TestSession.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Redteam.GenerateTest, {
    request: {
      body: jsonBody('TestCaseGenerationRequest', RedteamSchemas.GenerateTest.Request),
    },
    responses: {
      200: jsonResponse('TestCaseGenerationResponse', RedteamSchemas.GenerateTest.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Redteam.Run, {
    request: {
      body: jsonBody('RedteamRunRequest', RedteamSchemas.Run.Request),
    },
    responses: {
      200: jsonResponse('RedteamRunResponse', RedteamSchemas.Run.Response),
      400: validationError(),
    },
  });

  registerContract(ApiRoutes.Redteam.Cancel, {
    responses: {
      200: jsonResponse('RedteamCancelResponse', RedteamSchemas.Cancel.Response),
      400: validationError(),
    },
  });

  registerContract(ApiRoutes.Redteam.Task, {
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

  registerContract(ApiRoutes.Redteam.Status, {
    responses: {
      200: jsonResponse('RedteamStatusResponse', RedteamSchemas.Status.Response),
    },
  });

  registerContract(ApiRoutes.Traces.GetByEval, {
    request: {
      params: params('GetTracesByEvalParams', TracesSchemas.GetByEval.Params),
    },
    responses: {
      200: jsonResponse('GetTracesByEvalResponse', TracesSchemas.GetByEval.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Traces.Get, {
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

  registerContract(ApiRoutes.User.Get, {
    responses: {
      200: jsonResponse('GetUserResponse', UserSchemas.Get.Response),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.User.GetId, {
    responses: {
      200: jsonResponse('GetUserIdResponse', UserSchemas.GetId.Response),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.User.Update, {
    request: {
      body: jsonBody('UpdateUserRequest', UserSchemas.Update.Request),
    },
    responses: {
      200: jsonResponse('UpdateUserResponse', UserSchemas.Update.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.User.ClearEmail, {
    responses: {
      200: jsonResponse('ClearUserEmailResponse', UserSchemas.ClearEmail.Response),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.User.EmailStatus, {
    request: {
      query: query('GetEmailStatusQuery', UserSchemas.EmailStatus.Query),
    },
    responses: {
      200: jsonResponse('GetEmailStatusResponse', UserSchemas.EmailStatus.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.User.Login, {
    request: {
      body: jsonBody('LoginRequest', UserSchemas.Login.Request),
    },
    responses: {
      200: jsonResponse('LoginResponse', UserSchemas.Login.Response),
      400: validationError(),
      401: errorResponse('Authentication failed'),
    },
  });

  registerContract(ApiRoutes.User.Logout, {
    responses: {
      200: jsonResponse('LogoutResponse', UserSchemas.Logout.Response),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.User.CloudConfig, {
    responses: {
      200: jsonResponse('CloudConfigResponse', UserSchemas.CloudConfig.Response),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Version, {
    responses: {
      200: jsonResponse('VersionResponse', VersionSchemas.Response),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Blobs.Library, {
    request: {
      query: query('MediaLibraryQuery', BlobsSchemas.Library.Query),
    },
    responses: {
      200: jsonResponse('MediaLibraryResponse', BlobsSchemas.Library.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Blobs.LibraryEvals, {
    request: {
      query: query('MediaLibraryEvalsQuery', BlobsSchemas.LibraryEvals.Query),
    },
    responses: {
      200: jsonResponse('MediaLibraryEvalsResponse', BlobsSchemas.LibraryEvals.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Blobs.Get, {
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

type CreateServerOpenApiDocumentOptions = {
  serverDescription?: string;
  serverUrl?: string;
  version?: string;
};

export function createServerOpenApiDocument({
  serverDescription = 'Default local Promptfoo server',
  serverUrl = 'http://localhost:15500',
  version = VERSION,
}: CreateServerOpenApiDocumentOptions = {}) {
  const { registry } = createServerOpenApiRegistry({ version });
  const generator = new OpenApiGeneratorV31(registry.definitions, {
    sortComponents: 'alphabetically',
    unionPreferredType: 'oneOf',
  });

  return generator.generateDocument({
    openapi: SERVER_OPENAPI_VERSION,
    info: {
      title: 'Promptfoo Local Server API',
      version,
      description:
        'OpenAPI document generated from the shared Zod DTO schemas used by the Promptfoo local server and web UI.',
    },
    servers: [
      {
        url: serverUrl,
        description: serverDescription,
      },
    ],
  });
}
