import type {
  // Common
  ApiResponse,
  ListResponse,
  PaginationRequest,
  // Config
  ConfigListQuery,
  ConfigListResponse,
  ConfigCreateRequest,
  ConfigCreateResponse,
  ConfigGetByTypeParams,
  ConfigGetByTypeResponse,
  ConfigGetParams,
  ConfigGetResponse,
  // Eval
  EvalJobCreateRequest,
  EvalJobCreateResponse,
  EvalJobGetParams,
  EvalJobGetResponse,
  EvalCreateRequest,
  EvalCreateResponse,
  EvalUpdateParams,
  EvalUpdateRequest,
  EvalUpdateResponse,
  EvalDeleteParams,
  EvalDeleteResponse,
  EvalGetTableParams,
  EvalGetTableQuery,
  EvalGetTableResponse,
  EvalAddResultsParams,
  EvalAddResultsRequest,
  EvalUpdateResultRatingParams,
  EvalUpdateResultRatingRequest,
  EvalUpdateResultRatingResponse,
  // Provider
  ProviderTestRequest,
  ProviderTestResponse,
  ProviderDiscoverRequest,
  ProviderDiscoverResponse,
  // Redteam
  RedteamRunRequest,
  RedteamRunResponse,
  RedteamCancelResponse,
  RedteamStatusResponse,
  // Trace
  TraceGetByEvaluationParams,
  TraceGetByEvaluationResponse,
  TraceGetParams,
  TraceGetResponse,
  // Model Audit
  ModelAuditCheckInstalledResponse,
  ModelAuditCheckPathRequest,
  ModelAuditCheckPathResponse,
  ModelAuditScanRequest,
  ModelAuditScanResponse,
} from '@promptfoo/shared/dto';
import { callApi } from './api';

// Helper function for typed API calls
async function callApiTyped<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await callApi(path, options);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error (${response.status}): ${error}`);
  }
  return response.json();
}

// Config API
export const configApi = {
  list: (query?: ConfigListQuery) => {
    const params = query ? `?${new URLSearchParams(query as any).toString()}` : '';
    return callApiTyped<ConfigListResponse>(`/configs${params}`);
  },
  
  create: (data: ConfigCreateRequest) =>
    callApiTyped<ConfigCreateResponse>('/configs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  
  getByType: (type: string) =>
    callApiTyped<ConfigGetByTypeResponse>(`/configs/${type}`),
  
  get: (type: string, id: string) =>
    callApiTyped<ConfigGetResponse>(`/configs/${type}/${id}`),
};

// Eval Job API
export const evalJobApi = {
  create: (data: EvalJobCreateRequest) =>
    callApiTyped<EvalJobCreateResponse>('/eval/job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  
  get: (id: string) =>
    callApiTyped<EvalJobGetResponse>(`/eval/job/${id}`),
};

// Eval API
export const evalApi = {
  create: (data: EvalCreateRequest) =>
    callApiTyped<EvalCreateResponse>('/eval', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  
  update: (id: string, data: EvalUpdateRequest) =>
    callApiTyped<EvalUpdateResponse>(`/eval/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  
  delete: (id: string) =>
    callApiTyped<EvalDeleteResponse>(`/eval/${id}`, {
      method: 'DELETE',
    }),
  
  getTable: (id: string, query?: EvalGetTableQuery) => {
    const params = query ? `?${new URLSearchParams(query as any).toString()}` : '';
    return callApiTyped<EvalGetTableResponse>(`/eval/${id}/table${params}`);
  },
  
  addResults: (id: string, results: EvalAddResultsRequest) =>
    callApi(`/eval/${id}/results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(results),
    }).then(res => {
      if (!res.ok) throw new Error('Failed to add results');
    }),
  
  updateResultRating: (evalId: string, resultId: string, rating: EvalUpdateResultRatingRequest) =>
    callApiTyped<EvalUpdateResultRatingResponse>(
      `/eval/${evalId}/results/${resultId}/rating`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rating),
      },
    ),
};

// Provider API
export const providerApi = {
  test: (data: ProviderTestRequest) =>
    callApiTyped<ProviderTestResponse>('/providers/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  
  discover: (data: ProviderDiscoverRequest) =>
    callApiTyped<ProviderDiscoverResponse>('/providers/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
};

// Redteam API
export const redteamApi = {
  run: (data: RedteamRunRequest) =>
    callApiTyped<RedteamRunResponse>('/redteam/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  
  cancel: () =>
    callApiTyped<RedteamCancelResponse>('/redteam/cancel', {
      method: 'POST',
    }),
  
  status: () =>
    callApiTyped<RedteamStatusResponse>('/redteam/status'),
  
  forwardTask: (task: string, data: any) =>
    callApiTyped<any>(`/redteam/${task}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
};

// Trace API
export const traceApi = {
  getByEvaluation: (evaluationId: string) =>
    callApiTyped<TraceGetByEvaluationResponse>(`/traces/evaluation/${evaluationId}`),
  
  get: (traceId: string) =>
    callApiTyped<TraceGetResponse>(`/traces/${traceId}`),
};

// Model Audit API
export const modelAuditApi = {
  checkInstalled: () =>
    callApiTyped<ModelAuditCheckInstalledResponse>('/model-audit/check-installed'),
  
  checkPath: (data: ModelAuditCheckPathRequest) =>
    callApiTyped<ModelAuditCheckPathResponse>('/model-audit/check-path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  
  scan: (data: ModelAuditScanRequest) =>
    callApiTyped<ModelAuditScanResponse>('/model-audit/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
};