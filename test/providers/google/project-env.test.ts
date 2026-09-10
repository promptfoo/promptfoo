import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { resolveProjectId } from '../../../src/providers/google/auth';
import { GeminiImageProvider } from '../../../src/providers/google/gemini-image';
import { GoogleImageProvider } from '../../../src/providers/google/image';
import { GoogleVideoProvider } from '../../../src/providers/google/video';
import { fetchWithTimeout } from '../../../src/util/fetch/index';
import { ProviderOptionsSchema } from '../../../src/validators/providers';
import { mockProcessEnv } from '../../util/utils';

const auth = vi.hoisted(() => ({
  getClient: vi.fn(),
  getProjectId: vi.fn(),
  request: vi.fn(),
}));

vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    getClient = auth.getClient;
    getProjectId = auth.getProjectId;
  },
}));

vi.mock('../../../src/util/fetch/index', () => ({ fetchWithTimeout: vi.fn() }));
vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));

let restoreEnv: () => void;

beforeEach(() => {
  vi.resetAllMocks();
  restoreEnv = mockProcessEnv({
    VERTEX_PROJECT_ID: undefined,
    GOOGLE_PROJECT_ID: undefined,
    GOOGLE_CLOUD_PROJECT: undefined,
    GOOGLE_GENAI_USE_VERTEXAI: undefined,
  });
  auth.getClient.mockResolvedValue({ request: auth.request });
  auth.getProjectId.mockResolvedValue('adc-project');
});

afterEach(() => {
  restoreEnv();
  vi.resetAllMocks();
});

describe('scoped Google cloud project resolution', () => {
  it.each([
    [GoogleImageProvider, 'imagen-4.0-generate-001'],
    [GoogleVideoProvider, 'veo-3.1-generate-preview'],
  ])('preserves media API-key preflight opt-out for %p', (Provider, model) => {
    const provider = new Provider(model, { config: { vertexai: false, apiKeyRequired: false } });

    expect(provider.requiresApiKey()).toBe(false);
  });

  it('keeps process-selected AI Studio mode with a scoped project', async () => {
    mockProcessEnv({ GOOGLE_GENAI_USE_VERTEXAI: 'false' });
    const provider = new GoogleVideoProvider(
      'veo-3.1-generate-preview',
      ProviderOptionsSchema.parse({
        env: { GOOGLE_CLOUD_PROJECT: 'scoped-project' },
      }),
    );

    const result = await provider.callApi('A quiet garden');

    expect(result.error).toContain('requires an API key');
    expect(auth.request).not.toHaveBeenCalled();
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });

  it.each([undefined, false])(
    'routes scoped video project over process value with vertexai=%j',
    async (vertexai) => {
      mockProcessEnv({ GOOGLE_CLOUD_PROJECT: 'process-project' });
      auth.request.mockRejectedValue(new Error('Local video route fixture'));
      vi.mocked(fetchWithTimeout).mockRejectedValue(new Error('Local video route fixture'));
      const options = ProviderOptionsSchema.parse({
        config: { apiKey: 'local-fixture-key', vertexai },
        env: { GOOGLE_CLOUD_PROJECT: 'scoped-project' },
      });
      const provider = new GoogleVideoProvider('veo-3.1-generate-preview', options);
      expect(provider.requiresApiKey()).toBe(vertexai === false);

      const result = await provider.callApi('A quiet garden');

      expect(result.error).toBe('Failed to create video job: Local video route fixture');
      if (vertexai === false) {
        expect(auth.request).not.toHaveBeenCalled();
        expect(fetchWithTimeout).toHaveBeenCalledExactlyOnceWith(
          'https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning',
          expect.objectContaining({ method: 'POST' }),
          expect.any(Number),
        );
      } else {
        expect(fetchWithTimeout).not.toHaveBeenCalled();
        expect(auth.request).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            url: 'https://us-central1-aiplatform.googleapis.com/v1/projects/scoped-project/locations/us-central1/publishers/google/models/veo-3.1-generate-preview:predictLongRunning',
            method: 'POST',
          }),
        );
      }
    },
  );

  it.each([
    [{ projectId: 'configured' }, { GOOGLE_CLOUD_PROJECT: 'scoped' }, {}, 'configured'],
    [{}, { VERTEX_PROJECT_ID: 'vertex', GOOGLE_CLOUD_PROJECT: 'scoped' }, {}, 'vertex'],
    [{}, { GOOGLE_CLOUD_PROJECT: 'scoped' }, { VERTEX_PROJECT_ID: 'vertex' }, 'vertex'],
    [{}, { GOOGLE_PROJECT_ID: 'google', GOOGLE_CLOUD_PROJECT: 'scoped' }, {}, 'google'],
    [{}, { GOOGLE_CLOUD_PROJECT: 'scoped' }, { GOOGLE_PROJECT_ID: 'google' }, 'google'],
    [{}, { GOOGLE_CLOUD_PROJECT: 'scoped' }, { GOOGLE_CLOUD_PROJECT: 'process' }, 'scoped'],
    [{}, { GOOGLE_CLOUD_PROJECT: '' }, { GOOGLE_CLOUD_PROJECT: 'process' }, 'process'],
    [{}, {}, {}, 'adc-project'],
  ])(
    'preserves project precedence for config=%j, scoped=%j, process=%j',
    async (config, env, processEnv, expected) => {
      mockProcessEnv(processEnv);
      expect(await resolveProjectId(config, env)).toBe(expected);
    },
  );

  describe.each([
    {
      name: 'Imagen',
      Provider: GoogleImageProvider,
      model: 'imagen-4.0-generate-001',
      url: 'https://us-central1-aiplatform.googleapis.com/v1/projects/scoped-project/locations/us-central1/publishers/google/models/imagen-4.0-generate-001:predict',
      response: { predictions: [{ bytesBase64Encoded: 'aW1hZ2U=', mimeType: 'image/png' }] },
    },
    {
      name: 'Gemini image',
      Provider: GeminiImageProvider,
      model: 'gemini-3.1-flash-image',
      url: 'https://aiplatform.googleapis.com/v1/projects/scoped-project/locations/global/publishers/google/models/gemini-3.1-flash-image:generateContent',
      response: {
        candidates: [
          { content: { parts: [{ inlineData: { data: 'aW1hZ2U=', mimeType: 'image/png' } }] } },
        ],
      },
    },
  ])('$name request', ({ Provider, model, url, response }) => {
    it('honors explicit AI Studio mode despite a scoped project', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: response,
        status: 200,
        statusText: 'OK',
        cached: false,
        headers: {},
      });
      const options = ProviderOptionsSchema.parse({
        config: { apiKey: 'fixture-key', vertexai: false },
        env: { GOOGLE_CLOUD_PROJECT: 'scoped-project' },
      });
      const provider = new Provider(model, options);
      expect(provider.requiresApiKey()).toBe(true);

      await provider.callApi('Draw a circle');

      expect(auth.request).not.toHaveBeenCalled();
      expect(vi.mocked(fetchWithCache).mock.calls[0][0]).toContain(
        'generativelanguage.googleapis.com',
      );
    });
    it.each(['adc-project', undefined])(
      'uses the parsed scoped project when ADC reports %j',
      async (adcProject) => {
        auth.getProjectId.mockResolvedValue(adcProject);
        auth.request.mockResolvedValue({ data: response });
        const options = ProviderOptionsSchema.parse({
          env: { GOOGLE_CLOUD_PROJECT: 'scoped-project' },
        });
        const provider = new Provider(model, options);
        expect(provider.requiresApiKey()).toBe(false);

        const result = await provider.callApi('Draw a circle');

        expect(result.error).toBeUndefined();
        expect(result.images).toHaveLength(1);
        expect(auth.request).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ url, method: 'POST' }),
        );
      },
    );
  });
});
