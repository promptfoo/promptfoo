import { GoogleAuth } from 'google-auth-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import { GoogleAuthManager } from '../../../src/providers/google/auth';
import { CreateJobRequestSchema } from '../../../src/types/api/eval';
import { mockProcessEnv } from '../../util/utils';

const makeClient = (value: string) => ({
  quotaProjectId: 'host-quota',
  getAccessToken: vi.fn(async () => ({ token: value })),
});
vi.mock('google-auth-library', () => ({ GoogleAuth: vi.fn() }));
let restore: () => void;
beforeEach(() => {
  restore = mockProcessEnv({
    GOOGLE_APPLICATION_CREDENTIALS: undefined,
    GOOGLE_CLOUD_PROJECT: undefined,
    GCLOUD_PROJECT: undefined,
    GOOGLE_CLOUD_QUOTA_PROJECT: undefined,
  });
  GoogleAuthManager.clearCache();
  vi.mocked(GoogleAuth).mockReset();
  vi.mocked(GoogleAuth).mockImplementation(function (options) {
    return {
      getClient: vi.fn(async () => {
        if (options?.keyFilename === 'missing.json') {
          throw new Error('fixture absent');
        }
        return makeClient(String(options?.keyFilename));
      }),
      fromJSON: vi.fn(async (data) => makeClient(data.client_id)),
      getProjectId: vi.fn(async () => options?.projectId),
    } as unknown as GoogleAuth;
  });
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network access'));
});
afterEach(() => {
  restore();
  vi.restoreAllMocks();
});

describe('Google scoped ADC inputs', () => {
  it('retains ADC file and quota settings through actual API parsing and forwards them to the SDK', async () => {
    const env = {
      GOOGLE_APPLICATION_CREDENTIALS: 'scoped.json',
      GOOGLE_CLOUD_QUOTA_PROJECT: 'scoped-quota',
      GOOGLE_CLOUD_PROJECT: 'scoped-project',
    };
    const parsed = CreateJobRequestSchema.parse({ providers: ['echo'], prompts: ['fixture'], env });
    const { client } = await cliState.withEnv(parsed.env, () => GoogleAuthManager.getOAuthClient());
    expect(GoogleAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        keyFilename: 'scoped.json',
        projectId: 'scoped-project',
        clientOptions: { quotaProjectId: 'scoped-quota' },
      }),
    );
    expect(client.quotaProjectId).toBe('scoped-quota');
  });

  it.each(['provider', 'suite', 'file'] as const)(
    'does not rediscover a masked host project through the SDK (%s)',
    async (scope) => {
      mockProcessEnv({ GOOGLE_CLOUD_PROJECT: 'host-project' });
      const detectedProject = vi.fn(async () => 'host-project');
      const client = makeClient('fixture');
      vi.mocked(GoogleAuth).mockImplementation(function () {
        return {
          getClient: async () => client,
          getProjectId: detectedProject,
        } as unknown as GoogleAuth;
      });
      const env = { GOOGLE_CLOUD_PROJECT: '' };
      const load = () => GoogleAuthManager.getOAuthClient(scope === 'provider' ? { env } : {});
      const result = await (scope === 'provider'
        ? load()
        : scope === 'suite'
          ? cliState.withEnv(env, load)
          : cliState.withEnvFileOverrides(env, load));
      expect(result.projectId).toBeUndefined();
      expect(detectedProject).not.toHaveBeenCalled();
      expect(process.env.GOOGLE_CLOUD_PROJECT).toBe('host-project');
    },
  );

  it('retains credential-file projects and explicit project options when a host project is masked', async () => {
    mockProcessEnv({ GOOGLE_CLOUD_PROJECT: 'host-project' });
    vi.mocked(GoogleAuth).mockImplementation(function (options) {
      return {
        getClient: async () => ({ ...makeClient('fixture'), projectId: 'credential-project' }),
        getProjectId: async () => options?.projectId || 'host-project',
      } as unknown as GoogleAuth;
    });
    const env = { GOOGLE_CLOUD_PROJECT: '' };
    expect((await GoogleAuthManager.getOAuthClient({ env })).projectId).toBe('credential-project');
    expect(
      (await GoogleAuthManager.getOAuthClient({ env, projectId: 'explicit-project' })).projectId,
    ).toBe('explicit-project');
    expect(
      (
        await GoogleAuthManager.getOAuthClient({
          env,
          googleAuthOptions: { projectId: 'auth-option-project' },
        })
      ).projectId,
    ).toBe('auth-option-project');
  });

  it('prefers explicit auth options to scoped ADC and passes provider env above suite and file', async () => {
    await cliState.withEnvFileOverrides({ GOOGLE_APPLICATION_CREDENTIALS: 'file.json' }, () =>
      cliState.withEnv({ GOOGLE_APPLICATION_CREDENTIALS: 'suite.json' }, async () => {
        await GoogleAuthManager.getOAuthClient({
          env: { GOOGLE_APPLICATION_CREDENTIALS: 'provider.json' },
        });
        expect(GoogleAuth).toHaveBeenLastCalledWith(
          expect.objectContaining({ keyFilename: 'provider.json' }),
        );
        await GoogleAuthManager.getOAuthClient({
          keyFilename: 'config.json',
          env: { GOOGLE_APPLICATION_CREDENTIALS: 'provider.json' },
        });
        expect(GoogleAuth).toHaveBeenLastCalledWith(
          expect.objectContaining({ keyFilename: 'config.json' }),
        );
        const { client } = await GoogleAuthManager.getOAuthClient({
          credentials: JSON.stringify({ client_id: 'explicit-json' }),
        });
        expect(await client.getAccessToken()).toEqual({ token: 'explicit-json' });
      }),
    );
  });

  it('does not retain a failed default probe across evaluations, and shares one probe within an invocation', async () => {
    expect(
      await cliState.withEnv({ GOOGLE_APPLICATION_CREDENTIALS: 'missing.json' }, () =>
        GoogleAuthManager.hasDefaultCredentials(),
      ),
    ).toBe(false);
    await cliState.withEnv({ GOOGLE_APPLICATION_CREDENTIALS: 'present.json' }, async () => {
      expect(
        await Promise.all([
          GoogleAuthManager.hasDefaultCredentials(),
          GoogleAuthManager.hasDefaultCredentials(),
        ]),
      ).toEqual([true, true]);
    });
    expect(GoogleAuth).toHaveBeenCalledTimes(2);
  });
  it('rejects empty scoped ADC filenames before the SDK can discover lower credentials', async () => {
    mockProcessEnv({ GOOGLE_APPLICATION_CREDENTIALS: 'host.json' });
    await cliState.withEnv({ GOOGLE_APPLICATION_CREDENTIALS: 'suite.json' }, async () => {
      await expect(
        GoogleAuthManager.getOAuthClient({ env: { GOOGLE_APPLICATION_CREDENTIALS: '' } }),
      ).rejects.toThrow('empty');
      expect(
        await GoogleAuthManager.hasDefaultCredentials({ GOOGLE_APPLICATION_CREDENTIALS: '' }),
      ).toBe(false);
    });
    await cliState.withEnvFileOverrides({ GOOGLE_APPLICATION_CREDENTIALS: '' }, async () => {
      await expect(GoogleAuthManager.getOAuthClient()).rejects.toThrow('empty');
      expect(await GoogleAuthManager.hasDefaultCredentials()).toBe(false);
    });
    expect(GoogleAuth).not.toHaveBeenCalled();
    await GoogleAuthManager.getOAuthClient({
      keyFilename: 'explicit.json',
      env: { GOOGLE_APPLICATION_CREDENTIALS: '' },
    });
    expect(GoogleAuth).toHaveBeenCalledWith(
      expect.objectContaining({ keyFilename: 'explicit.json' }),
    );
  });
});
