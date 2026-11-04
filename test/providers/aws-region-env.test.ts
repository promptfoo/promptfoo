import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { resolveBedrockMantleRegion } from '../../src/providers/bedrock/mantle';
import { SageMakerCompletionProvider } from '../../src/providers/sagemaker';
import { mockProcessEnv } from '../util/utils';

import type { EnvOverrides } from '../../src/types/env';

vi.mock('../../src/telemetry', () => ({ default: { record: vi.fn() } }));
let restore: () => void;
beforeEach(() => {
  restore = mockProcessEnv({
    AWS_BEDROCK_REGION: undefined,
    AWS_REGION: undefined,
    AWS_DEFAULT_REGION: undefined,
  });
});
afterEach(() => {
  restore();
  vi.restoreAllMocks();
});

const selectors = [
  {
    name: 'Mantle',
    primary: 'AWS_BEDROCK_REGION',
    read: (env?: EnvOverrides, region?: string) =>
      resolveBedrockMantleRegion({ region }, env, 'us-east-1'),
  },
  {
    name: 'SageMaker',
    primary: 'AWS_REGION',
    read: (env?: EnvOverrides, region?: string) =>
      new SageMakerCompletionProvider('fixture', {
        config: { modelType: 'custom', region },
        env,
      }).getRegion(),
  },
] as const;

async function withLayer<T>(
  layer: string,
  env: EnvOverrides,
  read: (env?: EnvOverrides) => T,
): Promise<T> {
  if (layer === 'provider') {
    return read(env);
  }
  return layer === 'suite'
    ? cliState.withEnv(env, () => read())
    : cliState.withEnvFileOverrides(env, () => read());
}

describe.each(selectors)('$name region environment', ({ primary, read }) => {
  it.each(['provider', 'suite', 'file'])(
    'keeps empty %s values from reviving the same host alias',
    async (layer) => {
      mockProcessEnv({ [primary]: 'us-west-2' });
      expect(await withLayer(layer, { [primary]: '' }, read)).toBe('us-east-1');
    },
  );

  it.each(['provider', 'suite', 'file'])(
    'prefers a %s alias to a lower-priority scope',
    async (layer) => {
      mockProcessEnv({ [primary]: 'us-west-2' });
      expect(await withLayer(layer, { AWS_DEFAULT_REGION: 'eu-west-1' }, read)).toBe('eu-west-1');
    },
  );

  it('preserves config priority and unmasked aliases', () => {
    const env = { [primary]: '', AWS_DEFAULT_REGION: 'eu-west-1' };
    expect(read(env)).toBe('eu-west-1');
    expect(read(env, 'ap-south-1')).toBe('ap-south-1');
  });
});
