import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { doValidateTarget } from '../../src/commands/validate';
import logger from '../../src/logger';
import { loadApiProvider } from '../../src/providers/index';
import { createMockProvider } from '../factories/provider';

import type { UnifiedConfig } from '../../src/types/index';

vi.mock('../../src/logger');
vi.mock('../../src/providers/index');
vi.mock('../../src/telemetry', () => ({
  default: {
    record: vi.fn(),
    send: vi.fn(),
  },
}));
vi.mock('../../src/util/uuid', () => ({
  isUuid: vi.fn(() => false),
}));

describe('validate target falsy outputs', () => {
  const defaultConfig = {} as UnifiedConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = 0;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it.each([0, false, ''])('accepts provider output %j', async (output) => {
    const provider = createMockProvider({
      id: 'echo',
      response: { output },
    });
    vi.mocked(loadApiProvider).mockResolvedValue(provider);

    await doValidateTarget({ target: 'echo' }, defaultConfig);

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Connectivity test'));
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining(`Response: ${JSON.stringify(output)}`),
    );
    expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('Connectivity test'));
    expect(process.exitCode).toBe(0);
  });

  it('rejects null provider output', async () => {
    const provider = createMockProvider({
      id: 'echo',
      response: { output: null },
    });
    vi.mocked(loadApiProvider).mockResolvedValue(provider);

    await doValidateTarget({ target: 'echo' }, defaultConfig);

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Connectivity test'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('No output received'));
    expect(process.exitCode).toBe(1);
  });
});
