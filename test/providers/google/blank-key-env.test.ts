import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import cliState from '../../../src/cliState';
import { GoogleAuthManager } from '../../../src/providers/google/auth';
import { mockProcessEnv } from '../../util/utils';

let restore: () => void;
beforeEach(() => {
  restore = mockProcessEnv({
    GOOGLE_API_KEY: undefined,
    GEMINI_API_KEY: undefined,
    PALM_API_KEY: undefined,
    VERTEX_API_KEY: undefined,
    GOOGLE_APPLICATION_CREDENTIALS: undefined,
    GOOGLE_PROJECT_ID: undefined,
    VERTEX_PROJECT_ID: undefined,
    GOOGLE_CLOUD_PROJECT: undefined,
    GOOGLE_GENAI_USE_VERTEXAI: undefined,
  });
});
afterEach(() => restore());

describe('blank Google credentials', () => {
  it.each(['GOOGLE_API_KEY', 'GEMINI_API_KEY', 'PALM_API_KEY'] as const)(
    'keeps lower ADC eligible after a blank %s, while masking its lower alias',
    async (name) => {
      await cliState.withEnvFileOverrides(
        { GOOGLE_APPLICATION_CREDENTIALS: 'fixture.json', [name]: 'lower-key' },
        () => {
          const env = { [name]: ' \t ' };
          expect(GoogleAuthManager.determineVertexMode({}, env)).toBe(true);
          expect(GoogleAuthManager.getApiKey({}, env, true).apiKey).toBeUndefined();
          expect(GoogleAuthManager.getLiveApiKey({}, env).apiKey).toBeUndefined();
        },
      );
    },
  );
  it('keeps a lower project eligible after a blank suite key', async () => {
    await cliState.withEnvFileOverrides({ GOOGLE_CLOUD_PROJECT: 'fixture-project' }, () =>
      cliState.withEnv({ GOOGLE_API_KEY: ' \t ' }, () => {
        expect(GoogleAuthManager.determineVertexMode({})).toBe(true);
        expect(GoogleAuthManager.getApiKey({}).apiKey).toBeUndefined();
      }),
    );
  });
  it('uses a different usable alias, without exposing the masked alias', async () => {
    await cliState.withEnvFileOverrides(
      { GOOGLE_API_KEY: 'masked-key', GEMINI_API_KEY: 'usable-key' },
      () => {
        const env = { GOOGLE_API_KEY: ' \t ' };
        expect(GoogleAuthManager.determineVertexMode({}, env)).toBe(false);
        expect(GoogleAuthManager.getApiKey({}, env)).toEqual({
          apiKey: 'usable-key',
          source: 'GEMINI_API_KEY',
        });
      },
    );
  });
});
