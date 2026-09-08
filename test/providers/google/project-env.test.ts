import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveProjectId } from '../../../src/providers/google/auth';
import { GeminiImageProvider } from '../../../src/providers/google/gemini-image';
import { GoogleImageProvider } from '../../../src/providers/google/image';
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

let restoreEnv: () => void;

beforeEach(() => {
  vi.resetAllMocks();
  restoreEnv = mockProcessEnv({
    VERTEX_PROJECT_ID: undefined,
    GOOGLE_PROJECT_ID: undefined,
    GOOGLE_CLOUD_PROJECT: undefined,
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
    it.each(['adc-project', undefined])(
      'uses the parsed scoped project when ADC reports %j',
      async (adcProject) => {
        auth.getProjectId.mockResolvedValue(adcProject);
        auth.request.mockResolvedValue({ data: response });
        const options = ProviderOptionsSchema.parse({
          env: { GOOGLE_CLOUD_PROJECT: 'scoped-project' },
        });
        const provider = new Provider(model, options);

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
