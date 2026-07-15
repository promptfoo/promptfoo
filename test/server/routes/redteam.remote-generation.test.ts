import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';
import {
  getRemoteGenerationHeaders,
  getRemoteGenerationUrl,
  getRemoteHealthUrl,
  neverGenerateRemote,
  shouldGenerateRemote,
} from '../../../src/redteam/remoteGeneration';
import { createApp } from '../../../src/server/server';
import { checkRemoteHealth } from '../../../src/util/apiHealth';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));
vi.mock('../../../src/redteam/providers/shared');
vi.mock('../../../src/redteam/remoteGeneration', async (importOriginal) => ({
  ...(await importOriginal()),
  getRemoteGenerationHeaders: vi.fn(),
  getRemoteGenerationUrl: vi.fn(),
  getRemoteHealthUrl: vi.fn(),
  neverGenerateRemote: vi.fn(),
  shouldGenerateRemote: vi.fn(),
}));
vi.mock('../../../src/util/apiHealth', async (importOriginal) => ({
  ...(await importOriginal()),
  checkRemoteHealth: vi.fn(),
}));

describe('POST /redteam/generate-test remote generation accounting', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(shouldGenerateRemote).mockReturnValue(true);
    vi.mocked(neverGenerateRemote).mockReturnValue(false);
    vi.mocked(getRemoteGenerationUrl).mockReturnValue('http://test-url/task');
    vi.mocked(getRemoteHealthUrl).mockReturnValue('http://test-url/health');
    vi.mocked(getRemoteGenerationHeaders).mockReturnValue({
      'Content-Type': 'application/json',
    });
    vi.mocked(checkRemoteHealth).mockResolvedValue({ status: 'OK', message: 'healthy' });
    vi.mocked(redteamProviderManager.getProvider).mockResolvedValue({
      id: () => 'unused-provider',
      callApi: vi.fn(),
    } as any);
  });

  it('returns combined usage from an actual remote contracts plugin and citation strategy', async () => {
    vi.mocked(fetchWithCache).mockImplementation(async (_url, options) => {
      const task = JSON.parse(options?.body as string).task;
      if (task === 'contracts') {
        return {
          data: {
            result: [{ vars: { query: 'generated contract prompt' } }],
            tokenUsage: { total: 17, prompt: 10, completion: 7, numRequests: 1 },
          },
          cached: false,
          status: 200,
          statusText: 'OK',
        } as any;
      }

      expect(task).toBe('citation');
      return {
        data: {
          result: { citation: { type: 'Book', content: 'Reference content' } },
          tokenUsage: { total: 11, prompt: 7, completion: 4, numRequests: 1 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      } as any;
    });

    const response = await request(createApp())
      .post('/api/redteam/generate-test')
      .send({
        plugin: { id: 'contracts', config: {} },
        strategy: { id: 'citation', config: {} },
        config: { applicationDefinition: { purpose: 'test assistant' } },
      });

    expect(response.status).toBe(200);
    expect(response.body.prompt).toContain('Reference content');
    expect(response.body.tokenUsage).toEqual({
      total: 28,
      prompt: 17,
      completion: 11,
      cached: 0,
      numRequests: 2,
    });
  });

  it('does not count a cached remote plugin response as a live request', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        result: [{ vars: { query: 'generated contract prompt' } }],
        tokenUsage: { total: 17, prompt: 10, completion: 7, numRequests: 1 },
      },
      cached: true,
      status: 200,
      statusText: 'OK',
    } as any);

    const response = await request(createApp())
      .post('/api/redteam/generate-test')
      .send({
        plugin: { id: 'contracts', config: {} },
        strategy: { id: 'basic', config: {} },
        config: { applicationDefinition: { purpose: 'test assistant' } },
      });

    expect(response.status).toBe(200);
    expect(response.body.tokenUsage).toEqual({
      total: 17,
      prompt: 0,
      completion: 0,
      cached: 17,
      numRequests: 0,
    });
  });
});
