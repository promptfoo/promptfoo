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

type ApiMount = (typeof ApiMounts)[keyof typeof ApiMounts];
type MountedApiRouteFactory = (
  method: ApiHttpMethod,
  routerPath: string,
  operationId: string,
  summary: string,
) => ApiRouteContract;

function createMountedApiRouteFactory(mount: ApiMount, tag: string): MountedApiRouteFactory {
  const clientPrefix = mount.slice('/api'.length);
  return (method, routerPath, operationId, summary) =>
    mountedApiRoute(method, clientPrefix, routerPath, operationId, tag, summary);
}

const blobsRoute = createMountedApiRouteFactory(ApiMounts.Blobs, 'Blobs');
const configsRoute = createMountedApiRouteFactory(ApiMounts.Configs, 'Configs');
const evalRoute = createMountedApiRouteFactory(ApiMounts.Eval, 'Eval');
const mediaRoute = createMountedApiRouteFactory(ApiMounts.Media, 'Media');
const modelAuditRoute = createMountedApiRouteFactory(ApiMounts.ModelAudit, 'Model Audit');
const providersRoute = createMountedApiRouteFactory(ApiMounts.Providers, 'Providers');
const redteamRoute = createMountedApiRouteFactory(ApiMounts.Redteam, 'Redteam');
const tracesRoute = createMountedApiRouteFactory(ApiMounts.Traces, 'Traces');
const userRoute = createMountedApiRouteFactory(ApiMounts.User, 'User');
const versionRoute = createMountedApiRouteFactory(ApiMounts.Version, 'Version');

export const ApiRoutes = {
  Health: standaloneRoute('get', '/health', 'getHealth', 'Health', 'Check local server health'),
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
    List: configsRoute('get', '/', 'listConfigs', 'List stored configs'),
    Create: configsRoute('post', '/', 'createConfig', 'Create a stored config'),
    ListByType: configsRoute('get', '/:type', 'listConfigsByType', 'List stored configs by type'),
    Get: configsRoute('get', '/:type/:id', 'getConfig', 'Get a stored config'),
  },
  Eval: {
    CreateJob: evalRoute('post', '/job', 'createEvalJob', 'Start an evaluation job'),
    GetJob: evalRoute('get', '/job/:id', 'getEvalJob', 'Get evaluation job status'),
    Update: evalRoute('patch', '/:id', 'updateEval', 'Update an evaluation table or config'),
    UpdateAuthor: evalRoute('patch', '/:id/author', 'updateEvalAuthor', 'Update evaluation author'),
    Table: evalRoute('get', '/:id/table', 'getEvalTable', 'Get evaluation table data'),
    MetadataKeys: evalRoute(
      'get',
      '/:id/metadata-keys',
      'getEvalMetadataKeys',
      'List metadata keys for an evaluation',
    ),
    MetadataValues: evalRoute(
      'get',
      '/:id/metadata-values',
      'getEvalMetadataValues',
      'List metadata values for one key',
    ),
    AddResults: evalRoute(
      'post',
      '/:id/results',
      'addEvalResults',
      'Append results to an evaluation',
    ),
    Replay: evalRoute('post', '/replay', 'replayEval', 'Replay one evaluation test'),
    SubmitRating: evalRoute(
      'post',
      '/:evalId/results/:id/rating',
      'submitEvalResultRating',
      'Submit a rating for one result',
    ),
    Save: evalRoute('post', '/', 'saveEval', 'Save an evaluation result'),
    Delete: evalRoute('delete', '/:id', 'deleteEval', 'Delete one evaluation'),
    BulkDelete: evalRoute('delete', '/', 'bulkDeleteEvals', 'Delete multiple evaluations'),
    Copy: evalRoute('post', '/:id/copy', 'copyEval', 'Copy an evaluation'),
  },
  Media: {
    Stats: mediaRoute('get', '/stats', 'getMediaStats', 'Get media storage stats'),
    Info: mediaRoute('get', '/info/:type/:filename', 'getMediaInfo', 'Get media file metadata'),
    Get: mediaRoute('get', '/:type/:filename', 'getMedia', 'Fetch media file bytes'),
  },
  ModelAudit: {
    CheckInstalled: modelAuditRoute(
      'get',
      '/check-installed',
      'checkModelAuditInstalled',
      'Check whether ModelAudit is installed',
    ),
    ListScanners: modelAuditRoute(
      'get',
      '/scanners',
      'listModelAuditScanners',
      'List available ModelAudit scanners',
    ),
    CheckPath: modelAuditRoute(
      'post',
      '/check-path',
      'checkModelAuditPath',
      'Check whether a filesystem path exists',
    ),
    Scan: modelAuditRoute('post', '/scan', 'runModelAuditScan', 'Run a ModelAudit scan'),
    ListScans: modelAuditRoute(
      'get',
      '/scans',
      'listModelAuditScans',
      'List persisted ModelAudit scans',
    ),
    GetLatestScan: modelAuditRoute(
      'get',
      '/scans/latest',
      'getLatestModelAuditScan',
      'Get the latest persisted ModelAudit scan',
    ),
    GetScan: modelAuditRoute(
      'get',
      '/scans/:id',
      'getModelAuditScan',
      'Get one persisted ModelAudit scan',
    ),
    DeleteScan: modelAuditRoute(
      'delete',
      '/scans/:id',
      'deleteModelAuditScan',
      'Delete one persisted ModelAudit scan',
    ),
  },
  Providers: {
    ConfigStatus: providersRoute(
      'get',
      '/config-status',
      'getProviderConfigStatus',
      'Get provider config status',
    ),
    Test: providersRoute('post', '/test', 'testProvider', 'Test a provider configuration'),
    Discover: providersRoute(
      'post',
      '/discover',
      'discoverProviderTarget',
      'Discover target purpose from a provider',
    ),
    HttpGenerator: providersRoute(
      'post',
      '/http-generator',
      'generateHttpProvider',
      'Generate HTTP provider config from examples',
    ),
    TestRequestTransform: providersRoute(
      'post',
      '/test-request-transform',
      'testProviderRequestTransform',
      'Test an HTTP provider request transform',
    ),
    TestResponseTransform: providersRoute(
      'post',
      '/test-response-transform',
      'testProviderResponseTransform',
      'Test an HTTP provider response transform',
    ),
    TestSession: providersRoute(
      'post',
      '/test-session',
      'testProviderSession',
      'Test multi-turn provider session behavior',
    ),
  },
  Redteam: {
    GenerateTest: redteamRoute(
      'post',
      '/generate-test',
      'generateRedteamTest',
      'Generate one or more redteam test cases',
    ),
    Run: redteamRoute('post', '/run', 'runRedteam', 'Start a redteam run'),
    Cancel: redteamRoute('post', '/cancel', 'cancelRedteam', 'Cancel the running redteam job'),
    Task: redteamRoute('post', '/:taskId', 'runRedteamTask', 'Run a redteam setup task'),
    Status: redteamRoute('get', '/status', 'getRedteamStatus', 'Get redteam job status'),
  },
  Traces: {
    GetByEval: tracesRoute(
      'get',
      '/evaluation/:evaluationId',
      'getTracesByEvaluation',
      'List traces for an evaluation',
    ),
    Get: tracesRoute('get', '/:traceId', 'getTrace', 'Get one trace'),
  },
  User: {
    Get: userRoute('get', '/email', 'getUserEmail', 'Get configured user email'),
    GetId: userRoute('get', '/id', 'getUserId', 'Get local user ID'),
    Update: userRoute('post', '/email', 'updateUserEmail', 'Update configured user email'),
    ClearEmail: userRoute('put', '/email/clear', 'clearUserEmail', 'Clear configured user email'),
    EmailStatus: userRoute(
      'get',
      '/email/status',
      'getUserEmailStatus',
      'Get configured user email status',
    ),
    Login: userRoute('post', '/login', 'loginUser', 'Authenticate with Promptfoo Cloud'),
    Logout: userRoute('post', '/logout', 'logoutUser', 'Clear Promptfoo Cloud authentication'),
    CloudConfig: userRoute(
      'get',
      '/cloud-config',
      'getUserCloudConfig',
      'Get Promptfoo Cloud app config',
    ),
  },
  Version: versionRoute('get', '/', 'getVersion', 'Check Promptfoo version and update commands'),
  Blobs: {
    Library: blobsRoute(
      'get',
      '/library',
      'listMediaLibrary',
      'List media items from blob storage',
    ),
    LibraryEvals: blobsRoute(
      'get',
      '/library/evals',
      'listMediaLibraryEvals',
      'List evaluations that have blob-backed media',
    ),
    Get: blobsRoute('get', '/:hash', 'getBlob', 'Fetch blob bytes or redirect to blob storage'),
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
