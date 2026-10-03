import { afterEach, expect, it, vi } from 'vitest';
import { mockProcessEnv } from '../util/utils';

let restoreEnvironment: (() => void) | undefined;

afterEach(() => {
  restoreEnvironment?.();
  vi.doUnmock('../../src/util/envFile');
  vi.resetModules();
});

it('captures launch settings before importing environment-file configuration', async () => {
  vi.resetModules();
  restoreEnvironment = mockProcessEnv({ PROMPTFOO_DISABLE_UPDATE: 'true' });
  vi.doMock('../../src/util/envFile', () => ({
    loadEnvFiles: () => mockProcessEnv({ PROMPTFOO_DISABLE_UPDATE: 'false' }),
  }));
  await import('../../src/envars');
  const { getInitialProcessEnvironment } = await import(
    '../../src/updates/initialProcessEnvironment'
  );
  expect(process.env.PROMPTFOO_DISABLE_UPDATE).toBe('false');
  expect(getInitialProcessEnvironment().PROMPTFOO_DISABLE_UPDATE).toBe('true');
  const snapshot = getInitialProcessEnvironment();
  snapshot.PROMPTFOO_DISABLE_UPDATE = 'false';
  expect(getInitialProcessEnvironment().PROMPTFOO_DISABLE_UPDATE).toBe('true');
});
