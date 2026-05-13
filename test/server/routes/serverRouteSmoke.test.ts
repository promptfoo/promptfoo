import { IncomingMessage, ServerResponse } from 'node:http';
import { Duplex } from 'node:stream';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createServerOpenApiDocument,
  SERVER_OPENAPI_ROUTE_COUNT,
} from '../../../src/openapi/server';
import { createApp } from '../../../src/server/server';
import type { Express } from 'express';

const mocks = vi.hoisted(() => ({
  checkEmailStatus: vi.fn(),
  checkModelAuditInstalled: vi.fn(),
  checkRemoteHealth: vi.fn(),
  clearUserEmail: vi.fn(),
  cloudConfig: {
    delete: vi.fn(),
    getApiHost: vi.fn(),
    getAppUrl: vi.fn(),
    isEnabled: vi.fn(),
    validateAndSetApiToken: vi.fn(),
  },
  createShareableUrl: vi.fn(),
  deleteEval: vi.fn(),
  deleteEvals: vi.fn(),
  determineShareDomain: vi.fn(),
  doRedteamRun: vi.fn(),
  evalModel: {
    create: vi.fn(),
    findById: vi.fn(),
    latest: vi.fn(),
  },
  evalQueries: {
    getMetadataKeysFromEval: vi.fn(),
    getMetadataValuesFromEval: vi.fn(),
  },
  evalResultModel: {
    findById: vi.fn(),
  },
  fetchWithProxy: vi.fn(),
  getAvailableProviders: vi.fn(),
  getBlobByHash: vi.fn(),
  getBlobUrl: vi.fn(),
  getDb: vi.fn(),
  getEnvBool: vi.fn(),
  getEnvFloat: vi.fn(),
  getEnvInt: vi.fn(),
  getEnvString: vi.fn(),
  getEvalSummaries: vi.fn(),
  getLatestVersion: vi.fn(),
  getMediaStats: vi.fn(),
  getMediaStorage: vi.fn(),
  getPrompts: vi.fn(),
  getPromptsForTestCasesHash: vi.fn(),
  getStandaloneEvals: vi.fn(),
  getTestCases: vi.fn(),
  getTraceStore: vi.fn(),
  getUpdateCommands: vi.fn(),
  getUserEmail: vi.fn(),
  getUserId: vi.fn(),
  isBlobStorageEnabled: vi.fn(),
  isRunningUnderNpx: vi.fn(),
  loadApiProvider: vi.fn(),
  mediaExists: vi.fn(),
  modelAudit: {
    count: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    getMany: vi.fn(),
  },
  neverGenerateRemote: vi.fn(),
  promptfooEvaluate: vi.fn(),
  readResult: vi.fn(),
  retrieveMedia: vi.fn(),
  setUserEmail: vi.fn(),
  stripAuthFromUrl: vi.fn(),
  synthesizeFromTestSuite: vi.fn(),
  telemetry: {
    record: vi.fn(),
    saveConsent: vi.fn(),
  },
  testProviderConnectivity: vi.fn(),
  testProviderSession: vi.fn(),
  updateResult: vi.fn(),
  writeResultsToDatabase: vi.fn(),
}));

vi.mock('../../../src/blobs', () => ({
  getBlobByHash: mocks.getBlobByHash,
  getBlobUrl: mocks.getBlobUrl,
}));

vi.mock('../../../src/blobs/extractor', () => ({
  isBlobStorageEnabled: mocks.isBlobStorageEnabled,
}));

vi.mock('../../../src/commands/modelScan', () => ({
  checkModelAuditInstalled: mocks.checkModelAuditInstalled,
}));

vi.mock('../../../src/database', () => ({
  getDb: mocks.getDb,
}));

vi.mock('../../../src/database/index', () => ({
  getDb: mocks.getDb,
}));

vi.mock('../../../src/envars', () => ({
  getEnvBool: mocks.getEnvBool,
  getEnvFloat: mocks.getEnvFloat,
  getEnvInt: mocks.getEnvInt,
  getEvalTimeoutMs: vi.fn(() => 0),
  getMaxEvalTimeMs: vi.fn(() => 0),
  getEnvString: mocks.getEnvString,
  isCI: vi.fn(() => false),
  isNonInteractive: vi.fn(() => true),
}));

vi.mock('../../../src/globalConfig/accounts', () => ({
  checkEmailStatus: mocks.checkEmailStatus,
  clearUserEmail: mocks.clearUserEmail,
  getUserEmail: mocks.getUserEmail,
  getUserId: mocks.getUserId,
  setUserEmail: mocks.setUserEmail,
}));

vi.mock('../../../src/globalConfig/cloud', () => ({
  cloudConfig: mocks.cloudConfig,
}));

vi.mock('../../../src/node', () => ({
  evaluate: mocks.promptfooEvaluate,
}));

vi.mock('../../../src/models/eval', () => ({
  EvalQueries: mocks.evalQueries,
  default: mocks.evalModel,
  getEvalSummaries: mocks.getEvalSummaries,
}));

vi.mock('../../../src/models/evalResult', () => ({
  default: mocks.evalResultModel,
}));

vi.mock('../../../src/models/modelAudit', () => ({
  default: mocks.modelAudit,
}));

vi.mock('../../../src/providers/index', () => ({
  loadApiProvider: mocks.loadApiProvider,
}));

vi.mock('../../../src/redteam/remoteGeneration', () => ({
  getRemoteGenerationUrl: vi.fn(() => 'https://api.promptfoo.dev/task'),
  getRemoteHealthUrl: vi.fn(() => null),
  neverGenerateRemote: mocks.neverGenerateRemote,
}));

vi.mock('../../../src/redteam/shared', () => ({
  doRedteamRun: mocks.doRedteamRun,
}));

vi.mock('../../../src/share', () => ({
  createShareableUrl: mocks.createShareableUrl,
  determineShareDomain: mocks.determineShareDomain,
  stripAuthFromUrl: mocks.stripAuthFromUrl,
}));

vi.mock('../../../src/storage', () => ({
  getMediaStorage: mocks.getMediaStorage,
  mediaExists: mocks.mediaExists,
  retrieveMedia: mocks.retrieveMedia,
}));

vi.mock('../../../src/telemetry', () => ({
  default: mocks.telemetry,
}));

vi.mock('../../../src/testCase/synthesis', () => ({
  synthesizeFromTestSuite: mocks.synthesizeFromTestSuite,
}));

vi.mock('../../../src/tracing/store', () => ({
  getTraceStore: mocks.getTraceStore,
}));

vi.mock('../../../src/updates', () => ({
  getLatestVersion: mocks.getLatestVersion,
}));

vi.mock('../../../src/updates/updateCommands', () => ({
  getUpdateCommands: mocks.getUpdateCommands,
}));

vi.mock('../../../src/util/apiHealth', () => ({
  checkRemoteHealth: mocks.checkRemoteHealth,
}));

vi.mock('../../../src/util/database', () => ({
  deleteEval: mocks.deleteEval,
  deleteEvals: mocks.deleteEvals,
  getPrompts: mocks.getPrompts,
  getPromptsForTestCasesHash: mocks.getPromptsForTestCasesHash,
  getStandaloneEvals: mocks.getStandaloneEvals,
  getTestCases: mocks.getTestCases,
  readResult: mocks.readResult,
  updateResult: mocks.updateResult,
  writeResultsToDatabase: mocks.writeResultsToDatabase,
}));

vi.mock('../../../src/util/fetch/index', () => ({
  fetchWithProxy: mocks.fetchWithProxy,
}));

vi.mock('../../../src/util/promptfooCommand', () => ({
  isRunningUnderNpx: mocks.isRunningUnderNpx,
}));

vi.mock('../../../src/validators/testProvider', () => ({
  testProviderConnectivity: mocks.testProviderConnectivity,
  testProviderSession: mocks.testProviderSession,
}));

vi.mock('../../../src/server/config/serverConfig', () => ({
  getAvailableProviders: mocks.getAvailableProviders,
}));

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

type HttpMethod = (typeof HTTP_METHODS)[number];

type SmokeCase = {
  method: HttpMethod;
  openApiPath: string;
  path: string;
  expectedStatus: number;
  body?: unknown;
  rawJsonBody?: string;
  setup?: () => void;
};

class MockSocket extends Duplex {
  remoteAddress = '127.0.0.1';

  _read() {}

  _write(_chunk: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    callback();
  }
}

function createThenableQuery(rows: unknown[] = []) {
  const query = {
    all: vi.fn(() => rows),
    from: vi.fn(() => query),
    get: vi.fn(() => undefined),
    innerJoin: vi.fn(() => query),
    leftJoin: vi.fn(() => query),
    limit: vi.fn(() => query),
    offset: vi.fn(() => query),
    orderBy: vi.fn(() => query),
    // biome-ignore lint/suspicious/noThenProperty: Drizzle select builders are thenables, and config routes await them directly.
    then: (...args: Parameters<Promise<unknown[]>['then']>) => Promise.resolve(rows).then(...args),
    where: vi.fn(() => query),
  };

  return query;
}

function createMockDb() {
  return {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: 'config-1', createdAt: 0 }])),
      })),
    })),
    select: vi.fn(() => createThenableQuery([])),
    selectDistinct: vi.fn(() => createThenableQuery([])),
  };
}

function setupDefaultMocks() {
  const mockDb = createMockDb();
  mocks.getDb.mockReturnValue(mockDb);

  mocks.checkEmailStatus.mockResolvedValue({ hasEmail: false, status: 'no_email' });
  mocks.checkModelAuditInstalled.mockResolvedValue({ installed: false, version: null });
  mocks.checkRemoteHealth.mockResolvedValue({ status: 'OK', message: 'healthy' });
  mocks.cloudConfig.getApiHost.mockReturnValue('https://api.promptfoo.dev');
  mocks.cloudConfig.getAppUrl.mockReturnValue('https://app.promptfoo.dev');
  mocks.cloudConfig.isEnabled.mockReturnValue(false);
  mocks.deleteEval.mockResolvedValue(undefined);
  mocks.deleteEvals.mockReturnValue(undefined);
  mocks.determineShareDomain.mockReturnValue({ domain: 'https://app.promptfoo.dev' });
  mocks.evalModel.findById.mockResolvedValue(null);
  mocks.getAvailableProviders.mockReturnValue([]);
  mocks.getEnvBool.mockReturnValue(false);
  mocks.getEnvFloat.mockReturnValue(undefined);
  mocks.getEnvInt.mockReturnValue(undefined);
  mocks.getEnvString.mockImplementation((_key, fallback) => fallback);
  mocks.getEvalSummaries.mockResolvedValue([]);
  mocks.getLatestVersion.mockResolvedValue('999.0.0');
  mocks.getMediaStats.mockResolvedValue({ totalFiles: 0, totalSize: 0 });
  mocks.getMediaStorage.mockReturnValue({
    getStats: mocks.getMediaStats,
    providerId: 'test-storage',
  });
  mocks.getPrompts.mockResolvedValue([]);
  mocks.getPromptsForTestCasesHash.mockResolvedValue([]);
  mocks.getStandaloneEvals.mockResolvedValue([]);
  mocks.getTestCases.mockResolvedValue([]);
  mocks.getTraceStore.mockReturnValue({
    getTrace: vi.fn().mockResolvedValue(null),
    getTracesByEvaluation: vi.fn().mockResolvedValue([]),
  });
  mocks.getUpdateCommands.mockReturnValue({
    alternative: null,
    commandType: 'npm',
    primary: 'npm install -g promptfoo',
  });
  mocks.getUserEmail.mockReturnValue('');
  mocks.getUserId.mockReturnValue('user-1');
  mocks.isBlobStorageEnabled.mockReturnValue(false);
  mocks.isRunningUnderNpx.mockReturnValue(false);
  mocks.mediaExists.mockResolvedValue(false);
  mocks.modelAudit.count.mockResolvedValue(0);
  mocks.modelAudit.findById.mockResolvedValue(null);
  mocks.modelAudit.getMany.mockResolvedValue([]);
  mocks.neverGenerateRemote.mockReturnValue(false);
  mocks.readResult.mockResolvedValue(undefined);
  mocks.stripAuthFromUrl.mockImplementation((url) => url);
  mocks.synthesizeFromTestSuite.mockResolvedValue([]);
  mocks.telemetry.record.mockResolvedValue(undefined);
  mocks.telemetry.saveConsent.mockResolvedValue(undefined);
  mocks.updateResult.mockResolvedValue(undefined);
  mocks.writeResultsToDatabase.mockResolvedValue('eval-1');
}

function documentedRouteKeys() {
  const document = createServerOpenApiDocument();
  return Object.entries(document.paths ?? {}).flatMap(([path, pathItem]) =>
    HTTP_METHODS.flatMap((method) => {
      const operation = (pathItem as Partial<Record<(typeof HTTP_METHODS)[number], unknown>>)?.[
        method
      ];
      return operation ? [`${method.toUpperCase()} ${path}`] : [];
    }),
  );
}

function routeKey(testCase: Pick<SmokeCase, 'method' | 'openApiPath'>) {
  return `${testCase.method.toUpperCase()} ${testCase.openApiPath}`;
}

const validUuid = '00000000-0000-4000-8000-000000000000';
const validMediaFilename = 'abcdef123456.mp3';

const smokeCases: SmokeCase[] = [
  { method: 'get', openApiPath: '/health', path: '/health', expectedStatus: 200 },
  {
    method: 'get',
    openApiPath: '/api/remote-health',
    path: '/api/remote-health',
    expectedStatus: 200,
  },
  { method: 'get', openApiPath: '/api/results', path: '/api/results', expectedStatus: 200 },
  {
    method: 'get',
    openApiPath: '/api/results/{id}',
    path: '/api/results/missing-eval',
    expectedStatus: 404,
  },
  { method: 'get', openApiPath: '/api/prompts', path: '/api/prompts', expectedStatus: 200 },
  { method: 'get', openApiPath: '/api/history', path: '/api/history', expectedStatus: 200 },
  {
    method: 'get',
    openApiPath: '/api/prompts/{sha256hash}',
    path: '/api/prompts/not-a-sha',
    expectedStatus: 400,
  },
  { method: 'get', openApiPath: '/api/datasets', path: '/api/datasets', expectedStatus: 200 },
  {
    method: 'get',
    openApiPath: '/api/results/share/check-domain',
    path: '/api/results/share/check-domain',
    expectedStatus: 400,
  },
  {
    method: 'post',
    openApiPath: '/api/results/share',
    path: '/api/results/share',
    body: {},
    expectedStatus: 400,
  },
  {
    method: 'post',
    openApiPath: '/api/dataset/generate',
    path: '/api/dataset/generate',
    body: { prompts: [] },
    expectedStatus: 400,
  },
  {
    method: 'post',
    openApiPath: '/api/telemetry',
    path: '/api/telemetry',
    body: {},
    expectedStatus: 400,
  },
  { method: 'get', openApiPath: '/api/configs', path: '/api/configs', expectedStatus: 200 },
  {
    method: 'post',
    openApiPath: '/api/configs',
    path: '/api/configs',
    body: {},
    expectedStatus: 400,
  },
  {
    method: 'get',
    openApiPath: '/api/configs/{type}',
    path: '/api/configs/eval',
    expectedStatus: 200,
  },
  {
    method: 'get',
    openApiPath: '/api/configs/{type}/{id}',
    path: '/api/configs/eval/missing-config',
    expectedStatus: 404,
  },
  {
    method: 'post',
    openApiPath: '/api/eval/job',
    path: '/api/eval/job',
    body: { prompts: 'not-an-array' },
    expectedStatus: 400,
  },
  {
    method: 'get',
    openApiPath: '/api/eval/job/{id}',
    path: `/api/eval/job/${validUuid}`,
    expectedStatus: 404,
  },
  {
    method: 'patch',
    openApiPath: '/api/eval/{id}',
    path: '/api/eval/eval-1',
    body: { table: 'not-a-table' },
    expectedStatus: 400,
  },
  {
    method: 'delete',
    openApiPath: '/api/eval/{id}',
    path: '/api/eval/eval-1',
    expectedStatus: 200,
  },
  {
    method: 'patch',
    openApiPath: '/api/eval/{id}/author',
    path: '/api/eval/eval-1/author',
    body: { author: 'not-an-email' },
    expectedStatus: 400,
  },
  {
    method: 'get',
    openApiPath: '/api/eval/{id}/table',
    path: '/api/eval/eval-1/table?limit=abc',
    expectedStatus: 400,
  },
  {
    method: 'get',
    openApiPath: '/api/eval/{id}/metadata-keys',
    path: '/api/eval/ab/metadata-keys',
    expectedStatus: 400,
  },
  {
    method: 'get',
    openApiPath: '/api/eval/{id}/metadata-values',
    path: '/api/eval/eval-1/metadata-values',
    expectedStatus: 400,
  },
  {
    method: 'post',
    openApiPath: '/api/eval/{id}/results',
    path: '/api/eval/eval-1/results',
    body: {},
    expectedStatus: 400,
  },
  {
    method: 'post',
    openApiPath: '/api/eval/replay',
    path: '/api/eval/replay',
    body: {},
    expectedStatus: 400,
  },
  {
    method: 'post',
    openApiPath: '/api/eval/{evalId}/results/{id}/rating',
    path: '/api/eval/eval-1/results/result-1/rating',
    body: {},
    expectedStatus: 400,
  },
  {
    method: 'post',
    openApiPath: '/api/eval',
    path: '/api/eval',
    body: {},
    expectedStatus: 400,
  },
  {
    method: 'delete',
    openApiPath: '/api/eval',
    path: '/api/eval',
    body: { ids: [] },
    expectedStatus: 400,
  },
  {
    method: 'post',
    openApiPath: '/api/eval/{id}/copy',
    path: '/api/eval/eval-1/copy',
    body: { description: 123 },
    expectedStatus: 400,
  },
  { method: 'get', openApiPath: '/api/media/stats', path: '/api/media/stats', expectedStatus: 200 },
  {
    method: 'get',
    openApiPath: '/api/media/info/{type}/{filename}',
    path: `/api/media/info/audio/${validMediaFilename}`,
    expectedStatus: 404,
  },
  {
    method: 'get',
    openApiPath: '/api/media/{type}/{filename}',
    path: `/api/media/audio/${validMediaFilename}`,
    expectedStatus: 404,
  },
  {
    method: 'get',
    openApiPath: '/api/model-audit/check-installed',
    path: '/api/model-audit/check-installed',
    expectedStatus: 200,
  },
  {
    method: 'get',
    openApiPath: '/api/model-audit/scanners',
    path: '/api/model-audit/scanners',
    expectedStatus: 400,
  },
  {
    method: 'post',
    openApiPath: '/api/model-audit/check-path',
    path: '/api/model-audit/check-path',
    body: {},
    expectedStatus: 400,
  },
  {
    method: 'post',
    openApiPath: '/api/model-audit/scan',
    path: '/api/model-audit/scan',
    body: {},
    expectedStatus: 400,
  },
  {
    method: 'get',
    openApiPath: '/api/model-audit/scans',
    path: '/api/model-audit/scans',
    expectedStatus: 200,
  },
  {
    method: 'get',
    openApiPath: '/api/model-audit/scans/latest',
    path: '/api/model-audit/scans/latest',
    expectedStatus: 404,
  },
  {
    method: 'get',
    openApiPath: '/api/model-audit/scans/{id}',
    path: '/api/model-audit/scans/scan-1',
    expectedStatus: 404,
  },
  {
    method: 'delete',
    openApiPath: '/api/model-audit/scans/{id}',
    path: '/api/model-audit/scans/scan-1',
    expectedStatus: 404,
  },
  {
    method: 'get',
    openApiPath: '/api/providers/config-status',
    path: '/api/providers/config-status',
    expectedStatus: 200,
  },
  {
    method: 'post',
    openApiPath: '/api/providers/test',
    path: '/api/providers/test',
    body: {},
    expectedStatus: 400,
  },
  {
    method: 'post',
    openApiPath: '/api/providers/discover',
    path: '/api/providers/discover',
    body: {},
    expectedStatus: 400,
  },
  {
    method: 'post',
    openApiPath: '/api/providers/http-generator',
    path: '/api/providers/http-generator',
    body: {},
    expectedStatus: 400,
  },
  {
    method: 'post',
    openApiPath: '/api/providers/test-request-transform',
    path: '/api/providers/test-request-transform',
    body: {},
    expectedStatus: 400,
  },
  {
    method: 'post',
    openApiPath: '/api/providers/test-response-transform',
    path: '/api/providers/test-response-transform',
    body: {},
    expectedStatus: 400,
  },
  {
    method: 'post',
    openApiPath: '/api/providers/test-session',
    path: '/api/providers/test-session',
    body: {},
    expectedStatus: 400,
  },
  {
    method: 'post',
    openApiPath: '/api/redteam/generate-test',
    path: '/api/redteam/generate-test',
    body: {},
    expectedStatus: 400,
  },
  {
    method: 'post',
    openApiPath: '/api/redteam/run',
    path: '/api/redteam/run',
    body: {},
    expectedStatus: 400,
  },
  {
    method: 'post',
    openApiPath: '/api/redteam/cancel',
    path: '/api/redteam/cancel',
    expectedStatus: 400,
  },
  {
    method: 'post',
    openApiPath: '/api/redteam/{taskId}',
    path: '/api/redteam/task-1',
    body: [],
    expectedStatus: 400,
  },
  {
    method: 'get',
    openApiPath: '/api/redteam/status',
    path: '/api/redteam/status',
    expectedStatus: 200,
  },
  {
    method: 'get',
    openApiPath: '/api/traces/evaluation/{evaluationId}',
    path: '/api/traces/evaluation/eval-1',
    expectedStatus: 200,
  },
  {
    method: 'get',
    openApiPath: '/api/traces/{traceId}',
    path: '/api/traces/trace-1',
    expectedStatus: 404,
  },
  { method: 'get', openApiPath: '/api/user/email', path: '/api/user/email', expectedStatus: 200 },
  {
    method: 'post',
    openApiPath: '/api/user/email',
    path: '/api/user/email',
    body: {},
    expectedStatus: 400,
  },
  { method: 'get', openApiPath: '/api/user/id', path: '/api/user/id', expectedStatus: 200 },
  {
    method: 'put',
    openApiPath: '/api/user/email/clear',
    path: '/api/user/email/clear',
    expectedStatus: 200,
  },
  {
    method: 'get',
    openApiPath: '/api/user/email/status',
    path: '/api/user/email/status',
    expectedStatus: 200,
  },
  {
    method: 'post',
    openApiPath: '/api/user/login',
    path: '/api/user/login',
    body: {},
    expectedStatus: 400,
  },
  {
    method: 'post',
    openApiPath: '/api/user/logout',
    path: '/api/user/logout',
    expectedStatus: 200,
  },
  {
    method: 'get',
    openApiPath: '/api/user/cloud-config',
    path: '/api/user/cloud-config',
    expectedStatus: 200,
  },
  { method: 'get', openApiPath: '/api/version', path: '/api/version', expectedStatus: 200 },
  {
    method: 'get',
    openApiPath: '/api/blobs/library',
    path: '/api/blobs/library?limit=abc',
    setup: () => mocks.isBlobStorageEnabled.mockReturnValue(true),
    expectedStatus: 400,
  },
  {
    method: 'get',
    openApiPath: '/api/blobs/library/evals',
    path: '/api/blobs/library/evals?limit=abc',
    setup: () => mocks.isBlobStorageEnabled.mockReturnValue(true),
    expectedStatus: 400,
  },
  {
    method: 'get',
    openApiPath: '/api/blobs/{hash}',
    path: '/api/blobs/not-a-hash',
    setup: () => mocks.isBlobStorageEnabled.mockReturnValue(true),
    expectedStatus: 400,
  },
];

async function sendRequest(app: Express, testCase: SmokeCase) {
  const socket = new MockSocket();
  const req = new IncomingMessage(socket as never);
  req.method = testCase.method.toUpperCase();
  req.url = testCase.path;
  req.headers = {
    accept: 'application/json',
    host: '127.0.0.1',
  };

  let payload: Buffer | undefined;
  if (testCase.rawJsonBody !== undefined) {
    payload = Buffer.from(testCase.rawJsonBody);
  } else if ('body' in testCase) {
    payload = Buffer.from(JSON.stringify(testCase.body));
  }

  if (payload) {
    req.headers['content-type'] = 'application/json';
    req.headers['content-length'] = String(payload.length);
  }

  const res = new ServerResponse(req);
  res.assignSocket(socket as never);

  const chunks: Buffer[] = [];
  const write = res.write.bind(res);
  const end = res.end.bind(res);

  res.write = ((chunk: unknown, encoding?: BufferEncoding | ((error?: Error) => void)) => {
    if (chunk !== undefined) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    return write(chunk as never, encoding as never);
  }) as typeof res.write;

  res.end = ((chunk?: unknown, encoding?: BufferEncoding | (() => void), callback?: () => void) => {
    if (chunk !== undefined) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    return end(chunk as never, encoding as never, callback);
  }) as typeof res.end;

  const response = new Promise<{
    body: unknown;
    headers: ReturnType<ServerResponse['getHeaders']>;
    status: number;
    text: string;
  }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${routeKey(testCase)} did not finish`));
    }, 2000);

    res.once('finish', () => {
      clearTimeout(timeout);
      const text = Buffer.concat(chunks).toString('utf8');
      let body: unknown = {};
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }
      resolve({
        body,
        headers: res.getHeaders(),
        status: res.statusCode,
        text,
      });
    });
    res.once('error', reject);
    socket.once('error', reject);
  });

  req.push(payload ?? null);
  if (payload) {
    req.push(null);
  }
  app(req, res);

  return response;
}

describe('server route end-to-end smoke coverage', { concurrent: false }, () => {
  let app: Express;

  beforeAll(() => {
    setupDefaultMocks();
    app = createApp();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    setupDefaultMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('has one smoke case for every generated OpenAPI route', () => {
    const smokeKeys = smokeCases.map(routeKey).sort();
    const documentedKeys = documentedRouteKeys().sort();

    expect(smokeCases).toHaveLength(SERVER_OPENAPI_ROUTE_COUNT);
    expect(new Set(smokeKeys).size).toBe(SERVER_OPENAPI_ROUTE_COUNT);
    expect(smokeKeys).toEqual(documentedKeys);
  });

  it.each(smokeCases)('$method $openApiPath', async (testCase) => {
    testCase.setup?.();

    const response = await sendRequest(app, testCase);

    if (response.status !== testCase.expectedStatus) {
      throw new Error(
        `${routeKey(testCase)} expected ${testCase.expectedStatus}, got ${response.status}: ${
          response.text
        }`,
      );
    }

    if (response.status !== 204) {
      expect(response.headers['content-type']).toContain('application/json');
    }
  });
});
