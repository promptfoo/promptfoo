import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';

import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/server/server';

vi.mock('../../../src/globalConfig/cloud', () => ({
  cloudConfig: {
    isEnabled: vi.fn(),
    getApiHost: vi.fn(),
    getAppUrl: vi.fn(),
    validateAndSetApiToken: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../src/logger', () => ({
  __esModule: true,
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../../src/models/eval', () => ({
  default: {
    findById: vi.fn(),
  },
  getEvalSummaries: vi.fn(),
}));

vi.mock('../../../src/redteam/remoteGeneration', () => ({
  getRemoteHealthUrl: vi.fn(),
}));

vi.mock('../../../src/share', () => ({
  createShareableUrl: vi.fn(),
  determineShareDomain: vi.fn(),
  stripAuthFromUrl: vi.fn((url: string) => url),
}));

vi.mock('../../../src/telemetry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/telemetry')>();
  return {
    ...actual,
    default: {
      record: vi.fn(),
    },
  };
});

vi.mock('../../../src/testCase/synthesis', () => ({
  synthesizeFromTestSuite: vi.fn(),
}));

vi.mock('../../../src/util/apiHealth', () => ({
  checkRemoteHealth: vi.fn(),
}));

vi.mock('../../../src/util/database', () => ({
  getPrompts: vi.fn(),
  getPromptsForTestCasesHash: vi.fn(),
  getStandaloneEvals: vi.fn(),
  getTestCases: vi.fn(),
  readResult: vi.fn(),
}));

import { cloudConfig } from '../../../src/globalConfig/cloud';
import Eval, { getEvalSummaries } from '../../../src/models/eval';
import { getRemoteHealthUrl } from '../../../src/redteam/remoteGeneration';
import { createShareableUrl, determineShareDomain } from '../../../src/share';
import telemetry from '../../../src/telemetry';
import { synthesizeFromTestSuite } from '../../../src/testCase/synthesis';
import { checkRemoteHealth } from '../../../src/util/apiHealth';
import {
  getPrompts,
  getPromptsForTestCasesHash,
  getStandaloneEvals,
  getTestCases,
  readResult,
} from '../../../src/util/database';

const mockedCloudConfig = vi.mocked(cloudConfig);
const mockedEval = vi.mocked(Eval);
const mockedGetEvalSummaries = vi.mocked(getEvalSummaries);
const mockedGetRemoteHealthUrl = vi.mocked(getRemoteHealthUrl);
const mockedCreateShareableUrl = vi.mocked(createShareableUrl);
const mockedDetermineShareDomain = vi.mocked(determineShareDomain);
const mockedTelemetry = vi.mocked(telemetry);
const mockedSynthesizeFromTestSuite = vi.mocked(synthesizeFromTestSuite);
const mockedCheckRemoteHealth = vi.mocked(checkRemoteHealth);
const mockedGetPrompts = vi.mocked(getPrompts);
const mockedGetPromptsForTestCasesHash = vi.mocked(getPromptsForTestCasesHash);
const mockedGetStandaloneEvals = vi.mocked(getStandaloneEvals);
const mockedGetTestCases = vi.mocked(getTestCases);
const mockedReadResult = vi.mocked(readResult);

describe('inline server API DTO validation', () => {
  let api: ReturnType<typeof request.agent>;
  let server: Server;

  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server = createApp().listen(0, '127.0.0.1', (error?: Error) =>
        error ? reject(error) : resolve(),
      );
    });
    api = request.agent(server);
  });

  afterAll(async () => {
    if (!server.listening) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('validates and parses remote health responses', async () => {
    mockedGetRemoteHealthUrl.mockReturnValue('https://api.example.test/health');
    mockedCheckRemoteHealth.mockResolvedValue({ status: 'OK', message: 'healthy' });

    const response = await api.get('/api/remote-health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'OK', message: 'healthy' });
  });

  it('returns the disabled remote health DTO when remote generation is disabled', async () => {
    mockedGetRemoteHealthUrl.mockReturnValue(null);

    const response = await api.get('/api/remote-health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'DISABLED',
      message: 'remote generation and grading are disabled',
    });
    expect(mockedCheckRemoteHealth).not.toHaveBeenCalled();
  });

  it('validates /api/results query params before loading summaries', async () => {
    mockedGetEvalSummaries.mockResolvedValue([
      {
        evalId: 'eval-1',
        datasetId: 'dataset-1',
        createdAt: 1,
        description: 'Redteam report',
        numTests: 2,
      } as never,
    ]);

    const response = await api.get('/api/results?type=redteam&includeProviders=true');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(mockedGetEvalSummaries).toHaveBeenCalledWith(undefined, 'redteam', true);
  });

  it('rejects invalid /api/results query params', async () => {
    const response = await api.get('/api/results?type=sideways');

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('type');
    expect(mockedGetEvalSummaries).not.toHaveBeenCalled();
  });

  it('returns JSON error DTOs for missing result files', async () => {
    mockedReadResult.mockResolvedValue(undefined);

    const response = await api.get('/api/results/missing-eval');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Result not found' });
  });

  it('validates prompt hash params and returns prompt DTOs', async () => {
    const hash = 'a'.repeat(64);
    mockedGetPromptsForTestCasesHash.mockResolvedValue([{ raw: 'hello', label: 'hello' }] as never);

    const response = await api.get(`/api/prompts/${hash}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [{ raw: 'hello', label: 'hello' }] });
    expect(mockedGetPromptsForTestCasesHash).toHaveBeenCalledWith(hash);
  });

  it('rejects invalid prompt hash params', async () => {
    const response = await api.get('/api/prompts/not-a-sha');

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('sha256hash');
  });

  it('validates history query params and returns history DTOs', async () => {
    mockedGetStandaloneEvals.mockResolvedValue([{ id: 'eval-1' }] as never);

    const response = await api.get('/api/history?tagName=env&tagValue=prod');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [{ id: 'eval-1' }] });
    expect(mockedGetStandaloneEvals).toHaveBeenCalledWith({
      tag: { key: 'env', value: 'prod' },
      description: undefined,
    });
  });

  it('parses prompt and dataset list response DTOs', async () => {
    mockedGetPrompts.mockResolvedValue([{ raw: 'p', label: 'p' }] as never);
    mockedGetTestCases.mockResolvedValue([{ vars: { q: 'hello' } }] as never);

    const prompts = await api.get('/api/prompts');
    const datasets = await api.get('/api/datasets');

    expect(prompts.status).toBe(200);
    expect(prompts.body).toEqual({ data: [{ raw: 'p', label: 'p' }] });
    expect(datasets.status).toBe(200);
    expect(datasets.body).toEqual({ data: [{ vars: { q: 'hello' } }] });
  });

  it('validates share-domain query params', async () => {
    const response = await api.get('/api/results/share/check-domain');

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('id');
    expect(mockedEval.findById).not.toHaveBeenCalled();
  });

  it('returns share-domain DTOs for valid evals', async () => {
    mockedEval.findById.mockResolvedValue({ id: 'eval-1' } as never);
    mockedDetermineShareDomain.mockReturnValue({ domain: 'https://app.promptfoo.dev' } as never);
    mockedCloudConfig.isEnabled.mockReturnValue(true);

    const response = await api.get('/api/results/share/check-domain?id=eval-1');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      domain: 'https://app.promptfoo.dev',
      isCloudEnabled: true,
    });
  });

  it('validates share request bodies and parses share responses', async () => {
    mockedReadResult.mockResolvedValue({ result: { id: 'eval-1' } } as never);
    mockedEval.findById.mockResolvedValue({ id: 'eval-1' } as never);
    mockedCreateShareableUrl.mockResolvedValue('https://share.example/eval-1');

    const invalid = await api.post('/api/results/share').send({});
    const valid = await api.post('/api/results/share').send({ id: 'eval-1' });

    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toContain('id');
    expect(valid.status).toBe(200);
    expect(valid.body).toEqual({ url: 'https://share.example/eval-1' });
  });

  it('returns a 404 DTO when sharing a result whose eval row is missing', async () => {
    mockedReadResult.mockResolvedValue({ result: { id: 'eval-1' } } as never);
    mockedEval.findById.mockResolvedValue(null as never);

    const response = await api.post('/api/results/share').send({ id: 'eval-1' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Eval not found' });
    expect(mockedCreateShareableUrl).not.toHaveBeenCalled();
  });

  it('does not rate-limit share URL creation attempts', async () => {
    mockedReadResult.mockResolvedValue(undefined);

    const attempts = 35;
    for (let i = 0; i < attempts; i++) {
      const response = await api.post('/api/results/share').send({ id: `eval-${i}` });
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Eval not found' });
    }

    expect(mockedReadResult).toHaveBeenCalledTimes(attempts);
  });

  it('validates dataset generation request bodies', async () => {
    mockedSynthesizeFromTestSuite.mockResolvedValue([{ vars: { q: 'generated' } }] as never);

    const emptyPrompts = await api.post('/api/dataset/generate').send({ prompts: [], tests: [] });
    const invalidPrompt = await api
      .post('/api/dataset/generate')
      .send({ prompts: [null], tests: [] });
    const invalidTest = await api
      .post('/api/dataset/generate')
      .send({ prompts: ['Prompt'], tests: [null] });
    const promptOnly = await api.post('/api/dataset/generate').send({ prompts: ['Prompt'] });
    const valid = await api
      .post('/api/dataset/generate')
      .send({ prompts: ['Prompt'], tests: [{ vars: { q: 'seed' } }] });

    expect(emptyPrompts.status).toBe(400);
    expect(emptyPrompts.body.error).toContain('prompts');
    expect(invalidPrompt.status).toBe(400);
    expect(invalidPrompt.body.error).toContain('prompts');
    expect(invalidTest.status).toBe(400);
    expect(invalidTest.body.error).toContain('tests');
    expect(promptOnly.status).toBe(200);
    expect(promptOnly.body).toEqual({ results: [{ vars: { q: 'generated' } }] });
    expect(valid.status).toBe(200);
    expect(valid.body).toEqual({ results: [{ vars: { q: 'generated' } }] });
    expect(mockedSynthesizeFromTestSuite).toHaveBeenNthCalledWith(
      1,
      {
        prompts: [{ raw: 'Prompt', label: 'Prompt' }],
        tests: [],
        providers: [],
      },
      {},
    );
    expect(mockedSynthesizeFromTestSuite).toHaveBeenNthCalledWith(
      2,
      {
        prompts: [{ raw: 'Prompt', label: 'Prompt' }],
        tests: [{ vars: { q: 'seed' } }],
        providers: [],
      },
      {},
    );
  });

  it('validates telemetry request bodies and parses success DTOs', async () => {
    mockedTelemetry.record.mockReturnValue(undefined);

    const invalid = await api.post('/api/telemetry').send({ event: 'not-real' });
    const valid = await api
      .post('/api/telemetry')
      .send({ event: 'webui_api', properties: { route: '/api/results' } });

    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toContain('event');
    expect(valid.status).toBe(200);
    expect(valid.body).toEqual({ success: true });
    expect(mockedTelemetry.record).toHaveBeenCalledWith('webui_api', { route: '/api/results' });
  });

  it('accepts the full telemetry property value matrix and rejects nested objects', async () => {
    mockedTelemetry.record.mockReturnValue(undefined);

    const matrix = await api.post('/api/telemetry').send({
      event: 'webui_action',
      properties: {
        text: 'hi',
        count: 3,
        flag: true,
        tags: ['a', 'b'],
      },
    });
    const nested = await api
      .post('/api/telemetry')
      .send({ event: 'webui_action', properties: { nested: { k: 'v' } } });

    expect(matrix.status).toBe(200);
    expect(matrix.body).toEqual({ success: true });
    expect(mockedTelemetry.record).toHaveBeenCalledWith('webui_action', {
      text: 'hi',
      count: 3,
      flag: true,
      tags: ['a', 'b'],
    });

    expect(nested.status).toBe(400);
    expect(nested.body.error).toContain('properties');
  });

  it('returns a 500 DTO when telemetry recording throws', async () => {
    mockedTelemetry.record.mockImplementation(() => {
      throw new Error('posthog down');
    });

    const response = await api
      .post('/api/telemetry')
      .send({ event: 'webui_api', properties: { route: '/api/results' } });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to process telemetry request' });
  });

  it('returns the static health DTO without schema-parsing the response', async () => {
    const response = await api.get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'OK');
    expect(typeof response.body.version).toBe('string');
    expect(response.body.version.length).toBeGreaterThan(0);
  });

  it('coerces includeProviders only for "true"/true; everything else resolves to false', async () => {
    mockedGetEvalSummaries.mockResolvedValue([]);

    const cases: { query: string; expected: boolean }[] = [
      { query: '?includeProviders=true', expected: true },
      { query: '?includeProviders=false', expected: false },
      { query: '?includeProviders=1', expected: false },
      { query: '?includeProviders=yes', expected: false },
      { query: '', expected: false },
    ];

    for (const { query, expected } of cases) {
      mockedGetEvalSummaries.mockClear();
      const response = await api.get(`/api/results${query}`);
      expect(response.status).toBe(200);
      expect(mockedGetEvalSummaries).toHaveBeenCalledWith(undefined, undefined, expected);
    }
  });

  it('rejects the literal string "undefined" on share check-domain', async () => {
    const response = await api.get('/api/results/share/check-domain?id=undefined');

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('id');
    expect(mockedEval.findById).not.toHaveBeenCalled();
  });

  it('returns 404 from share check-domain when the eval is missing', async () => {
    mockedEval.findById.mockResolvedValue(null as never);

    const response = await api.get('/api/results/share/check-domain?id=eval-1');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Eval not found' });
    expect(mockedDetermineShareDomain).not.toHaveBeenCalled();
  });

  it('normalizes object-form prompts in dataset generation', async () => {
    mockedSynthesizeFromTestSuite.mockResolvedValue([{ vars: { q: 'generated' } }] as never);

    const labelMissing = await api.post('/api/dataset/generate').send({
      prompts: [{ raw: 'P1' }],
      tests: [],
    });
    const labelPresent = await api.post('/api/dataset/generate').send({
      prompts: [{ raw: 'P2', label: 'custom-label', extra: 'kept' }],
      tests: [],
    });

    expect(labelMissing.status).toBe(200);
    expect(labelPresent.status).toBe(200);
    expect(mockedSynthesizeFromTestSuite).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        prompts: [{ raw: 'P1', label: 'P1' }],
      }),
      {},
    );
    expect(mockedSynthesizeFromTestSuite).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        prompts: [{ raw: 'P2', label: 'custom-label', extra: 'kept' }],
      }),
      {},
    );
  });

  it('imports server DTO schemas without mutating the user config directory', () => {
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-server-dto-import-'));
    const importProbe = `
      await import('./src/types/api/server.ts');
      await import('./src/telemetryEvents.ts');
    `;

    try {
      const result = spawnSync(process.execPath, ['--import', 'tsx', '-e', importProbe], {
        cwd: path.resolve(__dirname, '../../..'),
        encoding: 'utf8',
        env: {
          ...process.env,
          PROMPTFOO_CONFIG_DIR: configDir,
          PROMPTFOO_DISABLE_TELEMETRY: 'true',
        },
      });

      expect(result.status, result.stderr || result.stdout).toBe(0);
      expect(fs.readdirSync(configDir)).toEqual([]);
    } finally {
      fs.rmSync(configDir, { recursive: true, force: true });
    }
  });
});
