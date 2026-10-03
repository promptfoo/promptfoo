import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';
import cliState from '../../src/cliState';
import { getAwsCredentialCacheNamespace } from '../../src/providers/awsCredentials';
import { AwsBedrockCompletionProvider } from '../../src/providers/bedrock';
import { createBedrockCacheKeyHash } from '../../src/providers/bedrock/base';
import {
  getCredentialCacheNamespace,
  getOpaqueCredentialCacheNamespace,
} from '../../src/providers/credentialCache';
import { VertexChatProvider } from '../../src/providers/google/vertex';
import { mockProcessEnv } from '../util/utils';

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
});

describe('scoped SDK response cache compatibility', () => {
  it('keeps identical public identities stable in independently started processes', () => {
    const moduleUrl = pathToFileURL(path.resolve('src/providers/credentialCache.ts')).href;
    const script = `import { getCredentialCacheNamespace } from ${JSON.stringify(moduleUrl)}; process.stdout.write(getCredentialCacheNamespace(['fixture-access-key', 'profile']));`;
    const run = () =>
      execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
        encoding: 'utf8',
      });
    expect(run()).toBe(run());
    expect(run()).toBe(getCredentialCacheNamespace(['fixture-access-key', 'profile']));
  });

  it('keeps opaque identities isolated without persistent secret fingerprints', () => {
    const first = getOpaqueCredentialCacheNamespace('fixture-bearer-one');
    expect(getOpaqueCredentialCacheNamespace('fixture-bearer-one')).toBe(first);
    expect(getOpaqueCredentialCacheNamespace('fixture-bearer-two')).not.toBe(first);
    expect(first).not.toContain('fixture-bearer');
  });

  it('retains the exact ambient and explicit Bedrock cache partition', async () => {
    restore = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: undefined, AWS_PROFILE: undefined });
    for (const config of [
      {},
      { accessKeyId: 'config-key', secretAccessKey: 'config-secret' },
      { apiKey: 'config-bearer' },
    ]) {
      const provider = new AwsBedrockCompletionProvider('fixture', { config });
      const cacheNamespace = Reflect.get(provider, 'responseCacheNamespace');
      expect(cacheNamespace).toBeUndefined();
      const input = { config, region: 'us-east-1', params: { prompt: 'fixture' } };
      expect(createBedrockCacheKeyHash({ ...input, cacheNamespace })).toBe(
        createBedrockCacheKeyHash(input),
      );
    }
  });

  it('keeps existing file-bearer fingerprints distinct and stable across scopes', async () => {
    const key = (token: string) =>
      cliState.withEnvFileOverrides({ AWS_BEARER_TOKEN_BEDROCK: token }, async () => {
        const provider = new AwsBedrockCompletionProvider('fixture');
        return createBedrockCacheKeyHash({
          config: {},
          params: {},
          region: 'us-east-1',
          cacheNamespace: Reflect.get(provider, 'responseCacheNamespace'),
        });
      });
    expect(await key('fixture-one')).toBe(await key('fixture-one'));
    expect(await key('fixture-one')).not.toBe(await key('fixture-two'));
  });

  it('invalidates same-path Google ADC and AWS profile caches after file replacement', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-credential-cache-'));
    const filename = path.join(dir, 'credentials');
    try {
      fs.writeFileSync(filename, 'first fixture identity');
      restore = mockProcessEnv({ AWS_SHARED_CREDENTIALS_FILE: filename });
      const vertex = new VertexChatProvider('gemini-2.5-flash', {
        env: { GOOGLE_APPLICATION_CREDENTIALS: filename },
      });
      const beforeGoogle = Reflect.get(vertex, 'getResponseCacheNamespace').call(vertex);
      const beforeAws = getAwsCredentialCacheNamespace({}, { AWS_PROFILE: 'fixture' });
      fs.writeFileSync(filename, 'replacement fixture identity with different permissions');
      expect(Reflect.get(vertex, 'getResponseCacheNamespace').call(vertex)).not.toBe(beforeGoogle);
      expect(getAwsCredentialCacheNamespace({}, { AWS_PROFILE: 'fixture' })).not.toBe(beforeAws);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
