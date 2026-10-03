import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { GoogleAuth, UserRefreshClient } from 'google-auth-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import { GoogleAuthManager } from '../../../src/providers/google/auth';
import { mockProcessEnv } from '../../util/utils';
import type { MockInstance } from 'vitest';

import type { OAuthClientOptions } from '../../../src/providers/google/auth';

const fixtureTempRoot = os.tmpdir();
const scopes = ['ambient', 'provider', 'suite', 'file'] as const;
type Scope = (typeof scopes)[number];
let directory: string;
let credentialFile: string;
let restore: () => void;
let gcloudProject: MockInstance;
let metadataProject: MockInstance;

beforeEach(() => {
  restore = mockProcessEnv({}, { clear: true });
  directory = fs.mkdtempSync(path.join(fixtureTempRoot, 'promptfoo-google-project-'));
  credentialFile = path.join(directory, 'application_default_credentials.json');
  fs.writeFileSync(
    credentialFile,
    JSON.stringify({
      type: 'authorized_user',
      client_id: 'fixture-client',
      client_secret: 'fixture-secret',
      refresh_token: 'fixture-refresh',
    }),
  );
  // Keep only the external gcloud/metadata lookups offline. The SDK's environment,
  // credential-file, project-cache, and project-discovery ordering are real.
  gcloudProject = vi
    .spyOn(Reflect.get(GoogleAuth, 'prototype'), 'getDefaultServiceProjectId')
    .mockResolvedValue(null);
  metadataProject = vi
    .spyOn(Reflect.get(GoogleAuth, 'prototype'), 'getGCEProjectId')
    .mockResolvedValue(null);
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network access'));
});

afterEach(() => {
  restore();
  vi.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

function withProjectScope<T>(scope: Scope, run: (options: OAuthClientOptions) => Promise<T>) {
  const env = { GOOGLE_CLOUD_PROJECT: '' };
  switch (scope) {
    case 'provider':
      return run({ env });
    case 'suite':
      return cliState.withEnv(env, () => run({}));
    case 'file':
      return cliState.withEnvFileOverrides(env, () => run({}));
    default:
      return run({});
  }
}

async function releasedProjectId(scope: Scope) {
  // Compare with the SDK discovering the same effective environment before
  // invocation settings stopped being installed in the process environment.
  const restoreProject =
    scope === 'ambient' ? () => {} : mockProcessEnv({ GOOGLE_CLOUD_PROJECT: '' });
  try {
    const auth = new GoogleAuth({ keyFilename: credentialFile });
    const client = await auth.getClient();
    expect(client).toBeInstanceOf(UserRefreshClient);
    return await auth.getProjectId().catch(() => undefined);
  } finally {
    restoreProject();
  }
}

describe('Google SDK project discovery with empty project settings', () => {
  it.each(
    scopes.flatMap((scope) =>
      [undefined, ''].flatMap((hostProject) =>
        ['gcloud', 'metadata', 'absent'].map((source) => ({ scope, hostProject, source })),
      ),
    ),
  )(
    'retains $source discovery for $scope with host=$hostProject',
    async ({ scope, hostProject, source }) => {
      mockProcessEnv({
        GOOGLE_APPLICATION_CREDENTIALS: credentialFile,
        GOOGLE_CLOUD_PROJECT: hostProject,
      });
      gcloudProject.mockResolvedValue(source === 'gcloud' ? 'gcloud-project' : null);
      metadataProject.mockResolvedValue(source === 'metadata' ? 'metadata-project' : null);
      const expected = await releasedProjectId(scope);
      const result = await withProjectScope(scope, (options) =>
        GoogleAuthManager.getOAuthClient(options),
      );
      expect(result.client).toBeInstanceOf(UserRefreshClient);
      expect(result.projectId).toBe(expected);
      expect(result.projectId).toBe(source === 'absent' ? undefined : `${source}-project`);
      expect(process.env.GOOGLE_CLOUD_PROJECT).toBe(hostProject);
      expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBe(credentialFile);
    },
  );

  it.each(
    ['GCLOUD_PROJECT', 'gcloud_project', 'google_cloud_project'].flatMap((alias) =>
      scopes.flatMap((scope) =>
        (scope === 'ambient' ? [''] : ['', 'host-project']).map((hostProject) => ({
          alias,
          scope,
          hostProject,
        })),
      ),
    ),
  )('retains $alias for $scope with host=$hostProject', async ({ alias, scope, hostProject }) => {
    mockProcessEnv({
      GOOGLE_APPLICATION_CREDENTIALS: credentialFile,
      GOOGLE_CLOUD_PROJECT: hostProject,
      [alias]: 'alias-project',
    });
    const expected = await releasedProjectId(scope);
    const result = await withProjectScope(scope, (options) =>
      GoogleAuthManager.getOAuthClient(options),
    );
    expect(result.projectId).toBe(expected);
    expect(result.projectId).toBe('alias-project');
    expect(gcloudProject).not.toHaveBeenCalled();
    expect(metadataProject).not.toHaveBeenCalled();
    expect(process.env.GOOGLE_CLOUD_PROJECT).toBe(hostProject);
    expect(process.env[alias]).toBe('alias-project');
  });

  it.each(['provider', 'suite', 'file'] as const)(
    'preserves SDK alias precedence when a %s project masks the host',
    async (scope) => {
      mockProcessEnv({
        GOOGLE_APPLICATION_CREDENTIALS: credentialFile,
        GOOGLE_CLOUD_PROJECT: 'host-project',
        GCLOUD_PROJECT: 'first-alias',
        gcloud_project: 'second-alias',
        google_cloud_project: 'third-alias',
      });
      for (const expected of ['first-alias', 'second-alias', 'third-alias']) {
        expect(await releasedProjectId(scope)).toBe(expected);
        const result = await withProjectScope(scope, (options) =>
          GoogleAuthManager.getOAuthClient(options),
        );
        expect(result.projectId).toBe(expected);
        mockProcessEnv(
          expected === 'first-alias' ? { GCLOUD_PROJECT: '' } : { gcloud_project: '' },
        );
      }
      expect(process.env.GOOGLE_CLOUD_PROJECT).toBe('host-project');
    },
  );

  it.each(['provider', 'suite', 'file'] as const)(
    'keeps an actual %s host mask isolated when no alias or credential project is available',
    async (scope) => {
      mockProcessEnv({
        GOOGLE_APPLICATION_CREDENTIALS: credentialFile,
        GOOGLE_CLOUD_PROJECT: 'host-project',
      });
      gcloudProject.mockResolvedValue('gcloud-project');
      metadataProject.mockResolvedValue('metadata-project');
      const result = await withProjectScope(scope, (options) =>
        GoogleAuthManager.getOAuthClient(options),
      );
      // The public SDK options cannot bypass only its host project lookup. Retain
      // the existing safe limitation instead of restoring the masked host value.
      expect(result.projectId).toBeUndefined();
      expect(gcloudProject).not.toHaveBeenCalled();
      expect(metadataProject).not.toHaveBeenCalled();
      expect(process.env.GOOGLE_CLOUD_PROJECT).toBe('host-project');
    },
  );

  it.each(['provider', 'suite', 'file'] as const)(
    'retains explicit project precedence over a %s mask and SDK aliases',
    async (scope) => {
      mockProcessEnv({
        GOOGLE_APPLICATION_CREDENTIALS: credentialFile,
        GOOGLE_CLOUD_PROJECT: 'host-project',
        GCLOUD_PROJECT: 'alias-project',
      });
      await withProjectScope(scope, async (options) => {
        const authOption = { googleAuthOptions: { projectId: 'auth-option-project' } };
        expect(
          (await GoogleAuthManager.getOAuthClient({ ...options, ...authOption })).projectId,
        ).toBe('auth-option-project');
        expect(
          (
            await GoogleAuthManager.getOAuthClient({
              ...options,
              ...authOption,
              projectId: 'explicit-project',
            })
          ).projectId,
        ).toBe('explicit-project');
      });
      expect(process.env.GOOGLE_CLOUD_PROJECT).toBe('host-project');
    },
  );

  it.each([{ projectId: '' }, { googleAuthOptions: { projectId: '' } }])(
    'preserves discovery for an empty configured project: %j',
    async (options) => {
      mockProcessEnv({ GOOGLE_APPLICATION_CREDENTIALS: credentialFile });
      gcloudProject.mockResolvedValue('gcloud-project');
      expect((await GoogleAuthManager.getOAuthClient(options)).projectId).toBe('gcloud-project');
    },
  );

  it('resolves the discovered project for Vertex with a harmless empty file setting', async () => {
    mockProcessEnv({ GOOGLE_APPLICATION_CREDENTIALS: credentialFile, GOOGLE_CLOUD_PROJECT: '' });
    gcloudProject.mockResolvedValue('gcloud-project');
    await cliState.withEnvFileOverrides({ GOOGLE_CLOUD_PROJECT: '' }, async () => {
      expect(await GoogleAuthManager.resolveProjectId({})).toBe('gcloud-project');
    });
  });
});
