export type ApiHttpMethod = 'delete' | 'get' | 'patch' | 'post' | 'put';

export type ApiRouteContract = {
  method: ApiHttpMethod;
  clientPath: string;
  expressPath: string;
  openApiPath: string;
  routerPath: string;
  operationId: string;
  tag: string;
  summary: string;
};

function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function rootApiRoute(
  method: ApiHttpMethod,
  clientPath: string,
  operationId: string,
  tag: string,
  summary: string,
): ApiRouteContract {
  const expressPath = `/api${clientPath}`;
  return {
    method,
    clientPath,
    expressPath,
    openApiPath: toOpenApiPath(expressPath),
    routerPath: expressPath,
    operationId,
    tag,
    summary,
  };
}

function mountedApiRoute(
  method: ApiHttpMethod,
  prefix: string,
  routerPath: string,
  operationId: string,
  tag: string,
  summary: string,
): ApiRouteContract {
  const clientPath = routerPath === '/' ? prefix : `${prefix}${routerPath}`;
  const route = rootApiRoute(method, clientPath, operationId, tag, summary);
  return { ...route, routerPath };
}

function standaloneRoute(
  method: ApiHttpMethod,
  path: string,
  operationId: string,
  tag: string,
  summary: string,
): ApiRouteContract {
  return {
    method,
    clientPath: path,
    expressPath: path,
    openApiPath: toOpenApiPath(path),
    routerPath: path,
    operationId,
    tag,
    summary,
  };
}

export const ApiMounts = {
  Blobs: '/api/blobs',
  Configs: '/api/configs',
  Eval: '/api/eval',
  Media: '/api/media',
  ModelAudit: '/api/model-audit',
  Providers: '/api/providers',
  Redteam: '/api/redteam',
  Traces: '/api/traces',
  User: '/api/user',
  Version: '/api/version',
} as const;

export const ApiRoutes = {
  Health: standaloneRoute('get', '/health', 'getHealth', 'Health', 'Check local server health'),
  OpenApi: rootApiRoute(
    'get',
    '/openapi.json',
    'getOpenApiSpec',
    'Discovery',
    'Fetch this OpenAPI document',
  ),
  RemoteHealth: rootApiRoute(
    'get',
    '/remote-health',
    'getRemoteHealth',
    'Health',
    'Check remote generation health',
  ),
  Results: {
    List: rootApiRoute(
      'get',
      '/results',
      'listResults',
      'Results',
      'List evaluation result summaries',
    ),
    Get: rootApiRoute('get', '/results/:id', 'getResult', 'Results', 'Get one evaluation result'),
    ShareCheckDomain: rootApiRoute(
      'get',
      '/results/share/check-domain',
      'checkShareDomain',
      'Sharing',
      'Check where an evaluation will be shared',
    ),
    Share: rootApiRoute(
      'post',
      '/results/share',
      'shareResult',
      'Sharing',
      'Create a shareable evaluation URL',
    ),
  },
  Prompts: {
    List: rootApiRoute('get', '/prompts', 'listPrompts', 'Prompts', 'List known prompts'),
    Get: rootApiRoute(
      'get',
      '/prompts/:sha256hash',
      'getPromptByHash',
      'Prompts',
      'Get prompts for a test-case hash',
    ),
  },
  History: rootApiRoute(
    'get',
    '/history',
    'listHistory',
    'Results',
    'List standalone evaluation history',
  ),
  Datasets: rootApiRoute('get', '/datasets', 'listDatasets', 'Datasets', 'List known datasets'),
  DatasetGenerate: rootApiRoute(
    'post',
    '/dataset/generate',
    'generateDataset',
    'Datasets',
    'Generate synthetic dataset rows',
  ),
  Telemetry: rootApiRoute(
    'post',
    '/telemetry',
    'recordTelemetry',
    'Telemetry',
    'Record a web UI telemetry event',
  ),
  Configs: {
    List: mountedApiRoute('get', '/configs', '/', 'listConfigs', 'Configs', 'List stored configs'),
    Create: mountedApiRoute(
      'post',
      '/configs',
      '/',
      'createConfig',
      'Configs',
      'Create a stored config',
    ),
    ListByType: mountedApiRoute(
      'get',
      '/configs',
      '/:type',
      'listConfigsByType',
      'Configs',
      'List stored configs by type',
    ),
    Get: mountedApiRoute(
      'get',
      '/configs',
      '/:type/:id',
      'getConfig',
      'Configs',
      'Get a stored config',
    ),
  },
  Eval: {
    CreateJob: mountedApiRoute(
      'post',
      '/eval',
      '/job',
      'createEvalJob',
      'Eval',
      'Start an evaluation job',
    ),
    GetJob: mountedApiRoute(
      'get',
      '/eval',
      '/job/:id',
      'getEvalJob',
      'Eval',
      'Get evaluation job status',
    ),
    Update: mountedApiRoute(
      'patch',
      '/eval',
      '/:id',
      'updateEval',
      'Eval',
      'Update an evaluation table or config',
    ),
    UpdateAuthor: mountedApiRoute(
      'patch',
      '/eval',
      '/:id/author',
      'updateEvalAuthor',
      'Eval',
      'Update evaluation author',
    ),
    Table: mountedApiRoute(
      'get',
      '/eval',
      '/:id/table',
      'getEvalTable',
      'Eval',
      'Get evaluation table data',
    ),
    MetadataKeys: mountedApiRoute(
      'get',
      '/eval',
      '/:id/metadata-keys',
      'getEvalMetadataKeys',
      'Eval',
      'List metadata keys for an evaluation',
    ),
    MetadataValues: mountedApiRoute(
      'get',
      '/eval',
      '/:id/metadata-values',
      'getEvalMetadataValues',
      'Eval',
      'List metadata values for one key',
    ),
    AddResults: mountedApiRoute(
      'post',
      '/eval',
      '/:id/results',
      'addEvalResults',
      'Eval',
      'Append results to an evaluation',
    ),
    Replay: mountedApiRoute(
      'post',
      '/eval',
      '/replay',
      'replayEval',
      'Eval',
      'Replay one evaluation test',
    ),
    SubmitRating: mountedApiRoute(
      'post',
      '/eval',
      '/:evalId/results/:id/rating',
      'submitEvalResultRating',
      'Eval',
      'Submit a rating for one result',
    ),
    Save: mountedApiRoute('post', '/eval', '/', 'saveEval', 'Eval', 'Save an evaluation result'),
    Delete: mountedApiRoute(
      'delete',
      '/eval',
      '/:id',
      'deleteEval',
      'Eval',
      'Delete one evaluation',
    ),
    BulkDelete: mountedApiRoute(
      'delete',
      '/eval',
      '/',
      'bulkDeleteEvals',
      'Eval',
      'Delete multiple evaluations',
    ),
    Copy: mountedApiRoute('post', '/eval', '/:id/copy', 'copyEval', 'Eval', 'Copy an evaluation'),
  },
  Media: {
    Stats: mountedApiRoute(
      'get',
      '/media',
      '/stats',
      'getMediaStats',
      'Media',
      'Get media storage stats',
    ),
    Info: mountedApiRoute(
      'get',
      '/media',
      '/info/:type/:filename',
      'getMediaInfo',
      'Media',
      'Get media file metadata',
    ),
    Get: mountedApiRoute(
      'get',
      '/media',
      '/:type/:filename',
      'getMedia',
      'Media',
      'Fetch media file bytes',
    ),
  },
  ModelAudit: {
    CheckInstalled: mountedApiRoute(
      'get',
      '/model-audit',
      '/check-installed',
      'checkModelAuditInstalled',
      'Model Audit',
      'Check whether ModelAudit is installed',
    ),
    ListScanners: mountedApiRoute(
      'get',
      '/model-audit',
      '/scanners',
      'listModelAuditScanners',
      'Model Audit',
      'List available ModelAudit scanners',
    ),
    CheckPath: mountedApiRoute(
      'post',
      '/model-audit',
      '/check-path',
      'checkModelAuditPath',
      'Model Audit',
      'Check whether a filesystem path exists',
    ),
    Scan: mountedApiRoute(
      'post',
      '/model-audit',
      '/scan',
      'runModelAuditScan',
      'Model Audit',
      'Run a ModelAudit scan',
    ),
    ListScans: mountedApiRoute(
      'get',
      '/model-audit',
      '/scans',
      'listModelAuditScans',
      'Model Audit',
      'List persisted ModelAudit scans',
    ),
    GetLatestScan: mountedApiRoute(
      'get',
      '/model-audit',
      '/scans/latest',
      'getLatestModelAuditScan',
      'Model Audit',
      'Get the latest persisted ModelAudit scan',
    ),
    GetScan: mountedApiRoute(
      'get',
      '/model-audit',
      '/scans/:id',
      'getModelAuditScan',
      'Model Audit',
      'Get one persisted ModelAudit scan',
    ),
    DeleteScan: mountedApiRoute(
      'delete',
      '/model-audit',
      '/scans/:id',
      'deleteModelAuditScan',
      'Model Audit',
      'Delete one persisted ModelAudit scan',
    ),
  },
  Providers: {
    ConfigStatus: mountedApiRoute(
      'get',
      '/providers',
      '/config-status',
      'getProviderConfigStatus',
      'Providers',
      'Get provider config status',
    ),
    Test: mountedApiRoute(
      'post',
      '/providers',
      '/test',
      'testProvider',
      'Providers',
      'Test a provider configuration',
    ),
    Discover: mountedApiRoute(
      'post',
      '/providers',
      '/discover',
      'discoverProviderTarget',
      'Providers',
      'Discover target purpose from a provider',
    ),
    HttpGenerator: mountedApiRoute(
      'post',
      '/providers',
      '/http-generator',
      'generateHttpProvider',
      'Providers',
      'Generate HTTP provider config from examples',
    ),
    TestRequestTransform: mountedApiRoute(
      'post',
      '/providers',
      '/test-request-transform',
      'testProviderRequestTransform',
      'Providers',
      'Test an HTTP provider request transform',
    ),
    TestResponseTransform: mountedApiRoute(
      'post',
      '/providers',
      '/test-response-transform',
      'testProviderResponseTransform',
      'Providers',
      'Test an HTTP provider response transform',
    ),
    TestSession: mountedApiRoute(
      'post',
      '/providers',
      '/test-session',
      'testProviderSession',
      'Providers',
      'Test multi-turn provider session behavior',
    ),
  },
  Redteam: {
    GenerateTest: mountedApiRoute(
      'post',
      '/redteam',
      '/generate-test',
      'generateRedteamTest',
      'Redteam',
      'Generate one or more redteam test cases',
    ),
    Run: mountedApiRoute(
      'post',
      '/redteam',
      '/run',
      'runRedteam',
      'Redteam',
      'Start a redteam run',
    ),
    Cancel: mountedApiRoute(
      'post',
      '/redteam',
      '/cancel',
      'cancelRedteam',
      'Redteam',
      'Cancel the running redteam job',
    ),
    Task: mountedApiRoute(
      'post',
      '/redteam',
      '/:taskId',
      'runRedteamTask',
      'Redteam',
      'Run a redteam setup task',
    ),
    Status: mountedApiRoute(
      'get',
      '/redteam',
      '/status',
      'getRedteamStatus',
      'Redteam',
      'Get redteam job status',
    ),
  },
  Traces: {
    GetByEval: mountedApiRoute(
      'get',
      '/traces',
      '/evaluation/:evaluationId',
      'getTracesByEvaluation',
      'Traces',
      'List traces for an evaluation',
    ),
    Get: mountedApiRoute('get', '/traces', '/:traceId', 'getTrace', 'Traces', 'Get one trace'),
  },
  User: {
    Get: mountedApiRoute(
      'get',
      '/user',
      '/email',
      'getUserEmail',
      'User',
      'Get configured user email',
    ),
    GetId: mountedApiRoute('get', '/user', '/id', 'getUserId', 'User', 'Get local user ID'),
    Update: mountedApiRoute(
      'post',
      '/user',
      '/email',
      'updateUserEmail',
      'User',
      'Update configured user email',
    ),
    ClearEmail: mountedApiRoute(
      'put',
      '/user',
      '/email/clear',
      'clearUserEmail',
      'User',
      'Clear configured user email',
    ),
    EmailStatus: mountedApiRoute(
      'get',
      '/user',
      '/email/status',
      'getUserEmailStatus',
      'User',
      'Get configured user email status',
    ),
    Login: mountedApiRoute(
      'post',
      '/user',
      '/login',
      'loginUser',
      'User',
      'Authenticate with Promptfoo Cloud',
    ),
    Logout: mountedApiRoute(
      'post',
      '/user',
      '/logout',
      'logoutUser',
      'User',
      'Clear Promptfoo Cloud authentication',
    ),
    CloudConfig: mountedApiRoute(
      'get',
      '/user',
      '/cloud-config',
      'getUserCloudConfig',
      'User',
      'Get Promptfoo Cloud app config',
    ),
  },
  Version: mountedApiRoute(
    'get',
    '/version',
    '/',
    'getVersion',
    'Version',
    'Check Promptfoo version and update commands',
  ),
  Blobs: {
    Library: mountedApiRoute(
      'get',
      '/blobs',
      '/library',
      'listMediaLibrary',
      'Blobs',
      'List media items from blob storage',
    ),
    LibraryEvals: mountedApiRoute(
      'get',
      '/blobs',
      '/library/evals',
      'listMediaLibraryEvals',
      'Blobs',
      'List evaluations that have blob-backed media',
    ),
    Get: mountedApiRoute(
      'get',
      '/blobs',
      '/:hash',
      'getBlob',
      'Blobs',
      'Fetch blob bytes or redirect to blob storage',
    ),
  },
} as const;

function collectRouteContracts(value: unknown): ApiRouteContract[] {
  if (
    typeof value === 'object' &&
    value !== null &&
    'operationId' in value &&
    'openApiPath' in value
  ) {
    return [value as ApiRouteContract];
  }
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  return Object.values(value).flatMap(collectRouteContracts);
}

export const ALL_API_ROUTES = collectRouteContracts(ApiRoutes);

export function buildApiPath(
  route: Pick<ApiRouteContract, 'clientPath'>,
  params: Record<string, string | number> = {},
): string {
  const path = route.clientPath.replace(/:([A-Za-z0-9_]+)/g, (_match, param: string) => {
    const value = params[param];
    if (value === undefined) {
      throw new Error(`Missing API path parameter: ${param}`);
    }
    return encodeURIComponent(String(value));
  });
  return path;
}
