import type { Server } from 'node:http';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/node', () => ({
  evaluateWithSource: vi.fn().mockResolvedValue({
    toEvaluateSummary: vi.fn().mockResolvedValue({ results: [] }),
    id: 'eval-id',
  }),
}));
vi.mock('../../../src/models/eval', () => ({
  default: { findById: vi.fn() },
  EvalQueries: {},
}));
vi.mock('../../../src/globalConfig/accounts');
vi.mock('../../../src/server/config/serverConfig', () => ({
  getAvailableProviders: vi.fn(),
  hasCustomProviderConfig: vi.fn(),
}));

import { evaluateWithSource } from '../../../src/node';
import {
  getAvailableProviders,
  hasCustomProviderConfig,
} from '../../../src/server/config/serverConfig';
import { createApp } from '../../../src/server/server';

const mockedEvaluateWithSource = vi.mocked(evaluateWithSource);
const mockedGetAvailableProviders = vi.mocked(getAvailableProviders);
const mockedHasCustomProviderConfig = vi.mocked(hasCustomProviderConfig);

describe('Eval Routes - provider catalog enforcement', () => {
  let api: ReturnType<typeof request.agent>;
  let server: Server;

  const catalogProvider = {
    id: 'echo',
    config: {
      temperature: 0,
      headers: { Authorization: 'Bearer {{ env.GATEWAY_KEY }}' },
    },
  };
  const minimalTestSuite = {
    prompts: ['test prompt'],
    providers: [catalogProvider],
    tests: [{ vars: { input: 'test' } }],
  };

  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server = createApp().listen(0, '127.0.0.1', (error?: Error) =>
        error ? reject(error) : resolve(),
      );
    });
    api = request.agent(server);
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockedHasCustomProviderConfig.mockReturnValue(true);
    mockedGetAvailableProviders.mockReturnValue([catalogProvider]);
    mockedEvaluateWithSource.mockResolvedValue({
      toEvaluateSummary: vi.fn().mockResolvedValue({ results: [] }),
      id: 'eval-id',
    } as never);
  });

  it.each([
    ['provider identity', { providers: ['openai:unapproved'] }],
    ['provider settings', { providers: [{ ...catalogProvider, config: { temperature: 1 } }] }],
    [
      'nested assertion provider',
      {
        tests: [
          {
            assert: [
              {
                type: 'assert-set',
                assert: [{ type: 'llm-rubric', provider: 'openai:unapproved' }],
              },
            ],
          },
        ],
      },
    ],
    ['defaultTest provider', { defaultTest: { provider: 'openai:unapproved' } }],
    [
      'scenario provider settings',
      { scenarios: [{ config: [], tests: [{ options: { temperature: 1 } }] }] },
    ],
    [
      'prompt provider settings',
      { prompts: [{ raw: 'test prompt', label: 'test prompt', config: { temperature: 1 } }] },
    ],
    ['catalog environment template', { env: { GATEWAY_KEY: 'user-controlled' } }],
  ])('rejects a direct job request with %s', async (_name, override) => {
    const response = await api.post('/api/eval/job').send({ ...minimalTestSuite, ...override });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('administrator catalog');
    expect(mockedEvaluateWithSource).not.toHaveBeenCalled();
  });

  it('accepts a catalog provider with assertions that do not select a provider', async () => {
    const response = await api.post('/api/eval/job').send({
      ...minimalTestSuite,
      tests: [{ assert: [{ type: 'contains', value: 'expected' }] }],
      env: { UNRELATED: 'allowed' },
    });

    expect(response.status).toBe(200);
    expect(mockedEvaluateWithSource).toHaveBeenCalledOnce();
  });

  it('does not restrict providers when no custom catalog is configured', async () => {
    mockedHasCustomProviderConfig.mockReturnValue(false);

    const response = await api.post('/api/eval/job').send({
      ...minimalTestSuite,
      providers: ['openai:unapproved'],
      tests: [{ assert: [{ type: 'llm-rubric', provider: 'openai:grader' }] }],
    });

    expect(response.status).toBe(200);
    expect(mockedEvaluateWithSource).toHaveBeenCalledOnce();
  });

  it('continues enforcing a cached custom catalog after the backing file is removed', async () => {
    const response = await api.post('/api/eval/job').send({
      ...minimalTestSuite,
      providers: ['openai:unapproved'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('administrator catalog');
    expect(mockedEvaluateWithSource).not.toHaveBeenCalled();
  });
});
