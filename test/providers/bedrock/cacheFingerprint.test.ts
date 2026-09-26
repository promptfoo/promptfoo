import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createBedrockCacheKeyHash } from '../../../src/providers/bedrock/base';
import * as fips from '../../../src/util/fips';
import { mockProcessEnv } from '../../util/utils';

let restoreEnv: () => void;
beforeEach(() => {
  restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: undefined });
  vi.spyOn(fips, 'isFipsEnabled').mockReturnValue(true);
});
afterEach(() => {
  restoreEnv();
  vi.restoreAllMocks();
});

it('supports short Bedrock profile names in FIPS mode without mixing their cache entries', () => {
  const fingerprint = (profile: string) =>
    createBedrockCacheKeyHash({
      config: { profile },
      params: { prompt: 'fixture' },
      region: 'us-east-1',
    });
  expect(fingerprint('default')).toBe(fingerprint('default'));
  expect(fingerprint('default')).not.toBe(fingerprint('prod'));
  expect(fingerprint('prod')).toMatch(/^[a-f0-9]{64}:[a-f0-9]{64}$/);
});
