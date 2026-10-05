import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getScopedAwsProfileCredentials } from '../../src/providers/awsProfileCredentials';
import { mockProcessEnv } from '../util/utils';
import type { AwsCredentialIdentity } from '@smithy/types';

const rootRequire = createRequire(import.meta.url);
const clientRequire = createRequire(rootRequire.resolve('@aws-sdk/client-bedrock-runtime'));
const nodeRequire = createRequire(clientRequire.resolve('@aws-sdk/credential-provider-node'));
const { defaultProvider } = nodeRequire('@aws-sdk/credential-provider-node');

const now = Date.parse('2026-01-01T00:00:00Z');
let directory: string;
let restore: () => void;
const clients: BedrockRuntimeClient[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-profile-refresh-'));
  fs.writeFileSync(path.join(directory, 'credentials'), '');
  fs.writeFileSync(
    path.join(directory, 'config'),
    '[profile fixture]\nrole_arn=arn:aws:iam::123456789012:role/Fixture\ncredential_source=Environment\n',
  );
  restore = mockProcessEnv(
    {
      AWS_ACCESS_KEY_ID: 'fixture-source',
      AWS_SECRET_ACCESS_KEY: 'fixture-secret',
      AWS_EC2_METADATA_DISABLED: 'true',
      AWS_CONFIG_FILE: path.join(directory, 'config'),
      AWS_SHARED_CREDENTIALS_FILE: path.join(directory, 'credentials'),
    },
    { clear: true },
  );
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network access'));
});

afterEach(() => {
  for (const client of clients.splice(0)) {
    client.destroy();
  }
  vi.resetAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
  restore();
  fs.rmSync(directory, { recursive: true, force: true });
});

async function createClient(kind: string) {
  const state: { identity: AwsCredentialIdentity; failure?: Error } = {
    identity: {
      accessKeyId: 'original-access',
      secretAccessKey: 'original-secret',
      expiration: new Date(now + 600_000),
    },
  };
  const roleAssumer = vi.fn(async () => {
    if (state.failure) {
      throw state.failure;
    }
    return state.identity;
  });
  const options = {
    profile: 'fixture',
    configFilepath: path.join(directory, 'config'),
    filepath: path.join(directory, 'credentials'),
    ignoreCache: true,
    roleAssumer,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  const client = new BedrockRuntimeClient({
    region: 'us-east-1',
    ...(kind === 'native'
      ? { credentialDefaultProvider: () => defaultProvider(options) }
      : {
          credentials: await getScopedAwsProfileCredentials(options, {
            AWS_SESSION_TOKEN: 'scoped-session',
          }),
        }),
  });
  clients.push(client);
  return { credentials: client.config.credentials, roleAssumer, state };
}

describe.each(['native', 'scoped'])('%s AWS profile refresh contract', (kind) => {
  it('returns valid credentials during a transient background refresh failure and recovers', async () => {
    const { credentials, roleAssumer, state } = await createClient(kind);
    const original = await credentials();
    vi.setSystemTime(now + 400_000);
    state.failure = new Error('fixture STS outage');
    await expect(credentials()).resolves.toEqual(original);
    await vi.waitFor(() => expect(roleAssumer).toHaveBeenCalledTimes(2));
    // Wait for the rejected background promise to settle without advancing time.
    await new Promise<void>((resolve) => setImmediate(resolve));
    state.failure = undefined;
    state.identity = {
      accessKeyId: 'renewed-access',
      secretAccessKey: 'renewed-secret',
      expiration: new Date(now + 1_800_000),
    };
    await expect(credentials()).resolves.toEqual(original);
    await vi.waitFor(() => expect(roleAssumer).toHaveBeenCalledTimes(3));
    await new Promise<void>((resolve) => setImmediate(resolve));
    await expect(credentials()).resolves.toMatchObject({ accessKeyId: 'renewed-access' });
    expect(roleAssumer).toHaveBeenCalledTimes(3);
  });

  it('does not return expired credentials when refresh fails', async () => {
    const { credentials, state } = await createClient(kind);
    await credentials();
    vi.setSystemTime(now + 600_001);
    state.failure = new Error('fixture STS outage');
    await expect(credentials()).rejects.toThrow('fixture STS outage');
  });

  it('awaits and propagates an explicitly forced refresh failure', async () => {
    const { credentials, state } = await createClient(kind);
    await credentials();
    state.failure = new Error('fixture forced refresh failure');
    await expect(credentials({ forceRefresh: true })).rejects.toThrow(
      'fixture forced refresh failure',
    );
  });

  it('coalesces concurrent initial and forced refresh calls', async () => {
    const { credentials, roleAssumer } = await createClient(kind);
    const first = await Promise.all([credentials(), credentials(), credentials()]);
    expect(first[0]).toEqual(first[1]);
    expect(first[1]).toEqual(first[2]);
    expect(roleAssumer).toHaveBeenCalledTimes(1);
    await Promise.all([
      credentials({ forceRefresh: true }),
      credentials({ forceRefresh: true }),
      credentials({ forceRefresh: true }),
    ]);
    expect(roleAssumer).toHaveBeenCalledTimes(2);
  });

  it('reuses credentials outside the refresh window', async () => {
    const { credentials, roleAssumer } = await createClient(kind);
    await credentials();
    vi.setSystemTime(now + 100_000);
    await credentials();
    await credentials();
    expect(roleAssumer).toHaveBeenCalledTimes(1);
  });
});
