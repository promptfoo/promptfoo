import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEnvBool } from '../../src/envars';
import { importModule } from '../../src/esm';
import { loadApiProvider } from '../../src/providers/index';
import { Telemetry } from '../../src/telemetry';
import { mockProcessEnv } from '../util/utils';

import type { ApiProvider, ProviderOptions } from '../../src/types/providers';

vi.mock('../../src/esm', async () => ({
  ...(await vi.importActual('../../src/esm')),
  importModule: vi.fn(),
}));

// Captures the environment view inside factory.create, which the loader runs
// inside cliState.withEnv(mergedEnv). This is the same scope a provider
// constructor such as SageMaker's sees when it calls telemetry.record, so it
// reproduces the production collapse the separated-layer envars test cannot:
// withEnv replaces the suite layer with the merged map, and a provider
// override of 'false' used to erase the suite's 'true' before getEnvBool ran.
const captured: {
  noNetwork?: boolean;
  telemetryDisabled?: boolean;
  mergedEnv?: Record<string, string | undefined>;
} = {};

class ProbeProvider implements ApiProvider {
  constructor(options: ProviderOptions = {}) {
    captured.noNetwork = getEnvBool('PROMPTFOO_NO_NETWORK');
    captured.telemetryDisabled = new Telemetry(false).disabled;
    captured.mergedEnv = { ...(options.env ?? {}) };
  }

  id(): string {
    return 'no-network-probe';
  }

  async callApi(prompt: string) {
    return { output: prompt };
  }
}

describe('PROMPTFOO_NO_NETWORK inside provider scopes', () => {
  beforeEach(() => {
    mockProcessEnv({ PROMPTFOO_NO_NETWORK: undefined });
    vi.mocked(importModule).mockResolvedValue(ProbeProvider);
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete captured.noNetwork;
    delete captured.telemetryDisabled;
    delete captured.mergedEnv;
  });

  it('keeps a suite no-network restriction when a provider override clears it', async () => {
    await loadApiProvider('file://probe-provider.js', {
      env: { PROMPTFOO_NO_NETWORK: 'true' },
      options: { env: { PROMPTFOO_NO_NETWORK: 'false' } },
    });

    expect(captured.mergedEnv?.PROMPTFOO_NO_NETWORK).toBe('true');
    expect(captured.noNetwork).toBe(true);
    expect(captured.telemetryDisabled).toBe(true);
  });

  it('keeps a suite no-network restriction without a provider override', async () => {
    await loadApiProvider('file://probe-provider.js', {
      env: { PROMPTFOO_NO_NETWORK: 'true' },
    });

    expect(captured.noNetwork).toBe(true);
    expect(captured.telemetryDisabled).toBe(true);
  });

  it('stays off when neither the suite nor the provider enables it', async () => {
    await loadApiProvider('file://probe-provider.js', {
      env: {},
      options: { env: { PROMPTFOO_NO_NETWORK: 'false' } },
    });

    expect(captured.noNetwork).toBe(false);
    expect(captured.telemetryDisabled).toBe(false);
  });

  it('stays off when the suite explicitly disables it', async () => {
    await loadApiProvider('file://probe-provider.js', {
      env: { PROMPTFOO_NO_NETWORK: 'false' },
      options: { env: { PROMPTFOO_NO_NETWORK: 'false' } },
    });

    expect(captured.noNetwork).toBe(false);
    expect(captured.telemetryDisabled).toBe(false);
  });
});
