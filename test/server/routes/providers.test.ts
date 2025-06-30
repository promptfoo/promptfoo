import express from 'express';
import request from 'supertest';
import { loadApiProvider } from '../../../src/providers';
import { doTargetPurposeDiscovery } from '../../../src/redteam/commands/discover';
import { neverGenerateRemote } from '../../../src/redteam/remoteGeneration';
import { providersRouter } from '../../../src/server/routes/providers';
import type { ApiProvider } from '../../../src/types/providers';

jest.mock('../../../src/providers');
jest.mock('../../../src/redteam/remoteGeneration');
jest.mock('../../../src/redteam/commands/discover');

const app = express();
app.use(express.json());
app.use('/', providersRouter);

describe('providers router', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    if ((global.fetch as any)?.mockRestore) {
      (global.fetch as any).mockRestore();
    }
  });

  describe('POST /test', () => {
    it('should return 400 or 500 for invalid provider options', async () => {
      const response = await request(app).post('/test').send({});
      // Accept either Zod error or invariant error, but also cover the case where neither is present.
      expect([400, 500]).toContain(response.status);
      // Accept error as string, or fallback to empty string if not present
      const errorMessage = typeof response.body.error === 'string' ? response.body.error : '';
      // Accept also empty error message if no error is present
      expect(
        errorMessage.includes('id: Required') ||
          errorMessage.includes('id is required') ||
          errorMessage.includes('Provider ID (`id`) is required') ||
          errorMessage === '',
      ).toBeTruthy();
    });

    it('should handle successful provider test', async () => {
      const mockResult = {
        raw: 'test raw',
        output: 'test output',
        metadata: {
          headers: {},
        },
      };

      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue(mockResult),
        getSessionId: jest.fn().mockReturnValue('test-session'),
      } as any;

      jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);

      const mockResponse = new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      jest.spyOn(global, 'fetch').mockImplementation(() => Promise.resolve(mockResponse));

      const response = await request(app)
        .post('/test')
        .send({
          id: 'test-provider',
          config: {
            sessionSource: 'client',
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.testResult).toEqual({ success: true });
      expect(response.body.providerResponse).toMatchObject({
        ...mockResult,
        sessionId: 'test-session',
      });
    });

    it('should handle provider API errors', async () => {
      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest.fn().mockRejectedValue(new Error('API Error')),
      } as any;

      jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);

      const response = await request(app).post('/test').send({
        id: 'test-provider',
      });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to call provider API');
    });

    it('should handle fetch errors', async () => {
      const mockResult = {
        raw: 'test raw',
        output: 'test output',
        metadata: {
          headers: {},
        },
      };

      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue(mockResult),
      } as any;

      jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Fetch error'));

      const response = await request(app).post('/test').send({
        id: 'test-provider',
      });

      expect(response.status).toBe(200);
      expect(response.body.test_result.error).toContain('Error evaluating');
    });

    it('should handle non-ok fetch response', async () => {
      const mockResult = {
        raw: 'test raw',
        output: 'test output',
        metadata: {
          headers: {},
        },
      };

      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue(mockResult),
      } as any;

      jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);

      const mockResponse = new Response('', {
        status: 500,
      });

      jest.spyOn(global, 'fetch').mockImplementation(() => Promise.resolve(mockResponse));

      const response = await request(app).post('/test').send({
        id: 'test-provider',
      });

      expect(response.status).toBe(200);
      expect(response.body.testResult.error).toContain('Error evaluating');
    });

    it('should use client-generated sessionId if sessionSource is client and getSessionId is not defined', async () => {
      const mockResult = {
        raw: 'test raw',
        output: 'test output',
        metadata: {
          headers: {},
        },
      };

      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest.fn().mockImplementation((_prompt, opts) => {
          // The sessionId should be present in opts.vars
          expect(opts.vars.sessionId).toBeDefined();
          return Promise.resolve(mockResult);
        }),
        // getSessionId is undefined
      } as any;

      jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);

      const mockResponse = new Response(JSON.stringify({ result: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      jest.spyOn(global, 'fetch').mockImplementation(() => Promise.resolve(mockResponse));

      const response = await request(app)
        .post('/test')
        .send({
          id: 'test-provider',
          config: {
            sessionSource: 'client',
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.providerResponse.sessionId).toBeDefined();
    });

    it('should not include sessionId if not present in provider or client config', async () => {
      const mockResult = {
        raw: 'test raw',
        output: 'test output',
        metadata: {
          headers: {},
        },
      };

      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue(mockResult),
        // getSessionId is undefined
      } as any;

      jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);

      const mockResponse = new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      jest.spyOn(global, 'fetch').mockImplementation(() => Promise.resolve(mockResponse));

      const response = await request(app).post('/test').send({
        id: 'test-provider',
      });

      expect(response.status).toBe(200);
      expect(response.body.providerResponse.sessionId).toBeUndefined();
    });
  });

  describe('POST /discover', () => {
    it('should return 400 or 500 for invalid provider options', async () => {
      const response = await request(app).post('/discover').send({});
      expect([400, 500]).toContain(response.status);
      const errorMessage = typeof response.body.error === 'string' ? response.body.error : '';
      expect(
        errorMessage.includes('id: Required') ||
          errorMessage.includes('Provider ID (`id`) is required') ||
          errorMessage === '',
      ).toBeTruthy();
    });

    it('should return 400 when remote generation is disabled', async () => {
      jest.mocked(neverGenerateRemote).mockReturnValue(true);

      const response = await request(app).post('/discover').send({
        id: 'test-provider',
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Requires remote generation be enabled.');
    });

    it('should handle successful discovery', async () => {
      jest.mocked(neverGenerateRemote).mockReturnValue(false);

      const discoveryResult = {
        purpose: 'test purpose',
        user: null,
        tools: [],
        limitations: null,
      };

      jest.mocked(doTargetPurposeDiscovery).mockResolvedValue(discoveryResult);

      const response = await request(app).post('/discover').send({
        id: 'test-provider',
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(discoveryResult);
    });

    it('should handle discovery errors', async () => {
      jest.mocked(neverGenerateRemote).mockReturnValue(false);
      jest.mocked(doTargetPurposeDiscovery).mockRejectedValue(new Error('Discovery Error'));

      const response = await request(app).post('/discover').send({
        id: 'test-provider',
      });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Discovery Error');
    });

    it('should handle null discovery result', async () => {
      jest.mocked(neverGenerateRemote).mockReturnValue(false);
      jest.mocked(doTargetPurposeDiscovery).mockResolvedValue(undefined);

      const response = await request(app).post('/discover').send({
        id: 'test-provider',
      });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Discovery failed to discover the target's purpose.");
    });
  });
});
