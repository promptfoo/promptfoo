import useApiConfig from '@app/stores/apiConfig';
import {
  type ApiRouteContract,
  ApiRoutes,
  BlobsSchemas,
  buildApiPath,
  ConfigSchemas,
  type ErrorResponse,
  ErrorResponseSchema,
  EVAL_TABLE_MAX_PAGE_SIZE,
  type EvalOption,
  EvalResponseSchemas,
  type GraderResult,
  type MediaItem,
  type MediaItemContext,
  type MediaLibraryResponse,
  ModelAuditSchemas,
  ProviderResponseSchemas,
  RedteamResponseSchemas,
  ServerResponseSchemas,
  type TestSessionResponse,
  TracesSchemas,
  type UpdateEvalAuthorResponse,
  UserSchemas,
  VersionSchemas,
} from '@promptfoo/contracts';
import type { ZodType } from 'zod';

export type {
  ApiRouteContract,
  EvalOption,
  GraderResult,
  MediaItem,
  MediaItemContext,
  MediaLibraryResponse,
  TestSessionResponse,
  UpdateEvalAuthorResponse,
};
export {
  ApiRoutes,
  BlobsSchemas,
  buildApiPath,
  ConfigSchemas,
  EVAL_TABLE_MAX_PAGE_SIZE,
  EvalResponseSchemas,
  ModelAuditSchemas,
  ProviderResponseSchemas,
  RedteamResponseSchemas,
  ServerResponseSchemas,
  TracesSchemas,
  UserSchemas,
  VersionSchemas,
};

export function getApiBaseUrl(): string {
  const { apiBaseUrl } = useApiConfig.getState();
  if (apiBaseUrl) {
    return apiBaseUrl.replace(/\/$/, '');
  }
  // Use base path from build-time config for local deployments behind reverse proxy
  return import.meta.env.VITE_PUBLIC_BASENAME || '';
}

export async function callApi(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${getApiBaseUrl()}/api${path}`, options);
}

export type ApiRequestOptions = RequestInit & {
  params?: Record<string, string | number>;
  query?: URLSearchParams;
};

export class ApiResponseError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ErrorResponse,
    public readonly response: Response,
  ) {
    super(body.error);
    this.name = 'ApiResponseError';
  }
}

type ApiResult<T> =
  | { ok: true; data: T; response: Response }
  | { ok: false; error: ApiResponseError; response: Response };

function createRoutePath(
  route: Pick<ApiRouteContract, 'clientPath'>,
  params?: Record<string, string | number>,
  query?: URLSearchParams,
): string {
  const path = buildApiPath(route, params);
  const search = query?.toString();
  return search ? `${path}?${search}` : path;
}

async function readErrorResponse(response: Response): Promise<ApiResponseError> {
  let body: ErrorResponse = { error: `Request failed (${response.status})` };
  try {
    const parsed = ErrorResponseSchema.safeParse(await response.json());
    if (parsed.success) {
      body = parsed.data;
    }
  } catch {
    // Some legacy/non-JSON upstream failures have no typed envelope.
  }
  return new ApiResponseError(response.status, body, response);
}

export async function callApiResult<T>(
  route: Pick<ApiRouteContract, 'clientPath'>,
  schema: ZodType<T>,
  options: ApiRequestOptions = {},
): Promise<ApiResult<T>> {
  const { params, query, ...requestInit } = options;
  const response = await callApi(createRoutePath(route, params, query), requestInit);
  if (!response.ok) {
    return { ok: false, error: await readErrorResponse(response), response };
  }
  return { ok: true, data: schema.parse(await response.json()), response };
}

export async function callApiJson<T>(
  route: Pick<ApiRouteContract, 'clientPath'>,
  schema: ZodType<T>,
  options: ApiRequestOptions = {},
): Promise<T> {
  const result = await callApiResult(route, schema, options);
  if (!result.ok) {
    throw result.error;
  }
  return result.data;
}

export async function callApiEmpty(
  route: Pick<ApiRouteContract, 'clientPath'>,
  options: ApiRequestOptions = {},
): Promise<void> {
  const { params, query, ...requestInit } = options;
  const response = await callApi(createRoutePath(route, params, query), requestInit);
  if (!response.ok) {
    throw await readErrorResponse(response);
  }
}

export async function fetchUserEmail(): Promise<string | null> {
  try {
    const data = await callApiJson(ApiRoutes.User.Get, UserSchemas.Get.Response, {
      method: 'GET',
    });
    return data.email;
  } catch (error) {
    console.error('Error fetching user email:', error);
    return null;
  }
}

export async function fetchUserId(): Promise<string | null> {
  try {
    const data = await callApiJson(ApiRoutes.User.GetId, UserSchemas.GetId.Response, {
      method: 'GET',
    });
    return data.id;
  } catch (error) {
    console.error('Error fetching user ID:', error);
    return null;
  }
}

export async function updateEvalAuthor(
  evalId: string,
  author: string,
): Promise<UpdateEvalAuthorResponse> {
  try {
    return await callApiJson(
      ApiRoutes.Eval.UpdateAuthor,
      EvalResponseSchemas.UpdateAuthor.Response,
      {
        params: { id: evalId },
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ author }),
      },
    );
  } catch (error) {
    if (error instanceof ApiResponseError) {
      throw new Error('Failed to update eval author');
    }
    throw error;
  }
}
