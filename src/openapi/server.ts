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
import { BlobsSchemas } from '../contracts/api/blobs';
import { ErrorResponseSchema } from '../contracts/api/common';
import { ConfigSchemas } from '../contracts/api/configs';
import { MediaSchemas } from '../contracts/api/media';
import { ModelAuditSchemas } from '../contracts/api/modelAudit';
import { JsonProviderOptionsWithIdSchema } from '../contracts/api/providers';
import { type ApiRouteContract, ApiRoutes } from '../contracts/api/routes';
import { TracesSchemas } from '../contracts/api/traces';
import { UserSchemas } from '../contracts/api/user';
import { VersionSchemas } from '../contracts/api/version';
import { EvalSchemas } from '../types/api/eval';
import { ProviderSchemas } from '../types/api/providers';
import { RedteamSchemas } from '../types/api/redteam';
import { ServerSchemas } from '../types/api/server';

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

const OpenApiTestProviderRequestSchema = z.object({
  prompt: z.string().optional(),
  providerOptions: JsonProviderOptionsWithIdSchema,
});

const OpenApiTestSessionRequestSchema = z.object({
  provider: JsonProviderOptionsWithIdSchema,
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
type RegisteredRouteConfig = RouteConfig & {
  operationId: string;
  tags: string[];
};

export function createServerOpenApiRegistry() {
  const registry = new OpenAPIRegistry();
  const routes: RegisteredRouteConfig[] = [];

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

  function jsonResponse(zodSchema: z.ZodType, description = 'Successful response'): ResponseConfig {
    return {
      description,
      content: {
        [APPLICATION_JSON]: {
          schema: zodSchema,
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
    return jsonResponse(ErrorResponseSchema, description);
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
      200: jsonResponse(ServerSchemas.Health.Response),
    },
  });

  registerContract(ApiRoutes.RemoteHealth, {
    responses: {
      200: jsonResponse(ServerSchemas.RemoteHealth.Response),
    },
  });

  registerContract(ApiRoutes.Results.List, {
    request: {
      query: ServerSchemas.ResultList.Query,
    },
    responses: {
      200: jsonResponse(ServerSchemas.ResultList.Response),
      400: validationError(),
    },
  });

  registerContract(ApiRoutes.Results.Get, {
    request: {
      params: ServerSchemas.Result.Params,
    },
    responses: {
      200: jsonResponse(ServerSchemas.Result.Response),
      400: validationError(),
      404: notFound('Result not found'),
    },
  });

  registerContract(ApiRoutes.Prompts.List, {
    responses: {
      200: jsonResponse(ServerSchemas.Prompts.Response),
    },
  });

  registerContract(ApiRoutes.History, {
    request: {
      query: ServerSchemas.History.Query,
    },
    responses: {
      200: jsonResponse(ServerSchemas.History.Response),
      400: validationError(),
    },
  });

  registerContract(ApiRoutes.Prompts.Get, {
    request: {
      params: ServerSchemas.Prompt.Params,
    },
    responses: {
      200: jsonResponse(ServerSchemas.Prompt.Response),
      400: validationError(),
    },
  });

  registerContract(ApiRoutes.Datasets, {
    responses: {
      200: jsonResponse(ServerSchemas.Datasets.Response),
    },
  });

  registerContract(ApiRoutes.Results.ShareCheckDomain, {
    request: {
      query: ServerSchemas.ShareCheckDomain.Query,
    },
    responses: {
      200: jsonResponse(ServerSchemas.ShareCheckDomain.Response),
      400: validationError(),
      404: notFound('Evaluation not found'),
    },
  });

  registerContract(ApiRoutes.Results.Share, {
    request: {
      body: jsonBody(ServerSchemas.Share.Request),
    },
    responses: {
      200: jsonResponse(ServerSchemas.Share.Response),
      400: validationError(),
      404: notFound('Evaluation not found'),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.DatasetGenerate, {
    request: {
      body: jsonBody(ServerSchemas.DatasetGenerate.Request),
    },
    responses: {
      200: jsonResponse(ServerSchemas.DatasetGenerate.Response),
      400: validationError(),
    },
  });

  registerContract(ApiRoutes.Telemetry, {
    request: {
      body: jsonBody(ServerSchemas.Telemetry.Request),
    },
    responses: {
      200: jsonResponse(ServerSchemas.Telemetry.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Configs.List, {
    request: {
      query: ConfigSchemas.List.Query,
    },
    responses: {
      200: jsonResponse(ConfigSchemas.List.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Configs.Create, {
    request: {
      body: jsonBody(ConfigSchemas.Create.Request),
    },
    responses: {
      200: jsonResponse(ConfigSchemas.Create.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Configs.ListByType, {
    request: {
      params: ConfigSchemas.ListByType.Params,
    },
    responses: {
      200: jsonResponse(ConfigSchemas.ListByType.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Configs.Get, {
    request: {
      params: ConfigSchemas.Get.Params,
    },
    responses: {
      200: jsonResponse(ConfigSchemas.Get.Response),
      400: validationError(),
      404: notFound('Config not found'),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Eval.CreateJob, {
    request: {
      body: jsonBody(OpenApiCreateJobRequestSchema),
    },
    responses: {
      200: jsonResponse(EvalSchemas.CreateJob.Response),
      400: validationError(),
    },
  });

  registerContract(ApiRoutes.Eval.GetJob, {
    request: {
      params: EvalSchemas.GetJob.Params,
    },
    responses: {
      200: jsonResponse(EvalSchemas.GetJob.Response),
      400: validationError(),
      404: notFound('Job not found'),
    },
  });

  registerContract(ApiRoutes.Eval.Update, {
    request: {
      params: EvalSchemas.Update.Params,
      body: jsonBody(EvalSchemas.Update.Request),
    },
    responses: {
      200: jsonResponse(EvalSchemas.Update.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Eval.UpdateAuthor, {
    request: {
      params: EvalSchemas.UpdateAuthor.Params,
      body: jsonBody(EvalSchemas.UpdateAuthor.Request),
    },
    responses: {
      200: jsonResponse(EvalSchemas.UpdateAuthor.Response),
      400: validationError(),
      404: notFound('Evaluation not found'),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Eval.Table, {
    request: {
      params: EvalSchemas.Table.Params,
      query: EvalSchemas.Table.Query,
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
      params: EvalSchemas.MetadataKeys.Params,
      query: EvalSchemas.MetadataKeys.Query,
    },
    responses: {
      200: jsonResponse(EvalSchemas.MetadataKeys.Response),
      400: validationError(),
      404: notFound('Evaluation not found'),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Eval.MetadataValues, {
    request: {
      params: EvalSchemas.MetadataValues.Params,
      query: EvalSchemas.MetadataValues.Query,
    },
    responses: {
      200: jsonResponse(EvalSchemas.MetadataValues.Response),
      400: validationError(),
      404: notFound('Evaluation not found'),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Eval.AddResults, {
    request: {
      params: EvalSchemas.AddResults.Params,
      body: jsonBody(EvalSchemas.AddResults.Request),
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
      body: jsonBody(EvalSchemas.Replay.Request),
    },
    responses: {
      200: jsonResponse(EvalSchemas.Replay.Response),
      400: validationError(),
      404: notFound('Evaluation not found'),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Eval.SubmitRating, {
    request: {
      params: EvalSchemas.SubmitRating.Params,
      body: jsonBody(EvalSchemas.SubmitRating.Request),
    },
    responses: {
      200: jsonResponse(EvalSchemas.SubmitRating.Response),
      400: validationError(),
      404: notFound('Result or evaluation not found'),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Eval.Save, {
    request: {
      body: jsonBody(EvalSchemas.Save.Request),
    },
    responses: {
      200: jsonResponse(EvalSchemas.Save.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Eval.Delete, {
    request: {
      params: EvalSchemas.Delete.Params,
    },
    responses: {
      200: jsonResponse(EvalSchemas.Delete.Response),
      400: validationError(),
      404: notFound('Evaluation not found'),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Eval.BulkDelete, {
    request: {
      body: jsonBody(EvalSchemas.BulkDelete.Request),
    },
    responses: {
      204: noContent('Evaluations deleted'),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Eval.Copy, {
    request: {
      params: EvalSchemas.Copy.Params,
      body: jsonBody(EvalSchemas.Copy.Request),
    },
    responses: {
      201: jsonResponse(EvalSchemas.Copy.Response, 'Evaluation copied'),
      400: validationError(),
      404: notFound('Evaluation not found'),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Media.Stats, {
    responses: {
      200: jsonResponse(MediaSchemas.Stats.Response),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Media.Info, {
    request: {
      params: MediaSchemas.Info.Params,
    },
    responses: {
      200: jsonResponse(MediaSchemas.Info.Response),
      400: validationError(),
      404: notFound('Media not found'),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Media.Get, {
    request: {
      params: MediaSchemas.Get.Params,
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
      200: jsonResponse(ModelAuditSchemas.CheckInstalled.Response),
    },
  });

  registerContract(ApiRoutes.ModelAudit.ListScanners, {
    responses: {
      200: jsonResponse(ModelAuditSchemas.ListScanners.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.ModelAudit.CheckPath, {
    request: {
      body: jsonBody(ModelAuditSchemas.CheckPath.Request),
    },
    responses: {
      200: jsonResponse(ModelAuditSchemas.CheckPath.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.ModelAudit.Scan, {
    request: {
      body: jsonBody(ModelAuditSchemas.Scan.Request),
    },
    responses: {
      200: jsonResponse(ModelAuditSchemas.Scan.Response),
      400: validationError(),
      500: jsonResponse(ModelAuditSchemas.Scan.ErrorResponse),
    },
  });

  registerContract(ApiRoutes.ModelAudit.ListScans, {
    request: {
      query: ModelAuditSchemas.ListScans.Query,
    },
    responses: {
      200: jsonResponse(ModelAuditSchemas.ListScans.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.ModelAudit.GetLatestScan, {
    responses: {
      200: jsonResponse(ModelAuditSchemas.GetLatestScan.Response),
      404: notFound('No scans found'),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.ModelAudit.GetScan, {
    request: {
      params: ModelAuditSchemas.GetScan.Params,
    },
    responses: {
      200: jsonResponse(ModelAuditSchemas.GetScan.Response),
      400: validationError(),
      404: notFound('Model scan not found'),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.ModelAudit.DeleteScan, {
    request: {
      params: ModelAuditSchemas.DeleteScan.Params,
    },
    responses: {
      200: jsonResponse(ModelAuditSchemas.DeleteScan.Response),
      400: validationError(),
      404: notFound('Model scan not found'),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Providers.ConfigStatus, {
    responses: {
      200: jsonResponse(ProviderSchemas.ConfigStatus.Response),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Providers.Test, {
    request: {
      body: jsonBody(OpenApiTestProviderRequestSchema),
    },
    responses: {
      200: jsonResponse(ProviderSchemas.Test.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Providers.Discover, {
    request: {
      body: jsonBody(JsonProviderOptionsWithIdSchema),
    },
    responses: {
      200: jsonResponse(ProviderSchemas.Discover.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Providers.HttpGenerator, {
    request: {
      body: jsonBody(ProviderSchemas.HttpGenerator.Request),
    },
    responses: {
      200: rawJsonResponse('Generated HTTP provider config', {}),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Providers.TestRequestTransform, {
    request: {
      body: jsonBody(ProviderSchemas.TestRequestTransform.Request),
    },
    responses: {
      200: jsonResponse(ProviderSchemas.TestRequestTransform.Response),
      400: jsonResponse(ErrorResponseSchema),
    },
  });

  registerContract(ApiRoutes.Providers.TestResponseTransform, {
    request: {
      body: jsonBody(ProviderSchemas.TestResponseTransform.Request),
    },
    responses: {
      200: jsonResponse(ProviderSchemas.TestResponseTransform.Response),
      400: jsonResponse(ErrorResponseSchema),
    },
  });

  registerContract(ApiRoutes.Providers.TestSession, {
    request: {
      body: jsonBody(OpenApiTestSessionRequestSchema),
    },
    responses: {
      200: jsonResponse(ProviderSchemas.TestSession.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Redteam.GenerateTest, {
    request: {
      body: jsonBody(RedteamSchemas.GenerateTest.Request),
    },
    responses: {
      200: jsonResponse(RedteamSchemas.GenerateTest.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Redteam.Run, {
    request: {
      body: jsonBody(RedteamSchemas.Run.Request),
    },
    responses: {
      200: jsonResponse(RedteamSchemas.Run.Response),
      400: validationError(),
    },
  });

  registerContract(ApiRoutes.Redteam.Cancel, {
    responses: {
      200: jsonResponse(RedteamSchemas.Cancel.Response),
      400: validationError(),
    },
  });

  registerContract(ApiRoutes.Redteam.Task, {
    request: {
      params: RedteamSchemas.Task.Params,
      body: jsonBody(RedteamSchemas.Task.Request),
    },
    responses: {
      200: rawJsonResponse('Task-specific JSON response', {}),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Redteam.Status, {
    responses: {
      200: jsonResponse(RedteamSchemas.Status.Response),
    },
  });

  registerContract(ApiRoutes.Traces.GetByEval, {
    request: {
      params: TracesSchemas.GetByEval.Params,
    },
    responses: {
      200: jsonResponse(TracesSchemas.GetByEval.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Traces.Get, {
    request: {
      params: TracesSchemas.Get.Params,
    },
    responses: {
      200: jsonResponse(TracesSchemas.Get.Response),
      400: validationError(),
      404: notFound('Trace not found'),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.User.Get, {
    responses: {
      200: jsonResponse(UserSchemas.Get.Response),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.User.GetId, {
    responses: {
      200: jsonResponse(UserSchemas.GetId.Response),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.User.Update, {
    request: {
      body: jsonBody(UserSchemas.Update.Request),
    },
    responses: {
      200: jsonResponse(UserSchemas.Update.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.User.ClearEmail, {
    responses: {
      200: jsonResponse(UserSchemas.ClearEmail.Response),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.User.EmailStatus, {
    request: {
      query: UserSchemas.EmailStatus.Query,
    },
    responses: {
      200: jsonResponse(UserSchemas.EmailStatus.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.User.Login, {
    request: {
      body: jsonBody(UserSchemas.Login.Request),
    },
    responses: {
      200: jsonResponse(UserSchemas.Login.Response),
      400: validationError(),
      401: errorResponse('Authentication failed'),
    },
  });

  registerContract(ApiRoutes.User.Logout, {
    responses: {
      200: jsonResponse(UserSchemas.Logout.Response),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.User.CloudConfig, {
    responses: {
      200: jsonResponse(UserSchemas.CloudConfig.Response),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Version, {
    responses: {
      200: jsonResponse(VersionSchemas.Response),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Blobs.Library, {
    request: {
      query: BlobsSchemas.Library.Query,
    },
    responses: {
      200: jsonResponse(BlobsSchemas.Library.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Blobs.LibraryEvals, {
    request: {
      query: BlobsSchemas.LibraryEvals.Query,
    },
    responses: {
      200: jsonResponse(BlobsSchemas.LibraryEvals.Response),
      400: validationError(),
      500: serverError(),
    },
  });

  registerContract(ApiRoutes.Blobs.Get, {
    request: {
      params: BlobsSchemas.Get.Params,
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
