import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
}));

const originalEnv = { ...process.env };

describe('code-scan-action entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.run.mockReset();

    process.env = {
      ...originalEnv,
      GITHUB_BASE_REF: 'main',
      GITHUB_WORKSPACE: '/test/workspace',
    };
    mocks.run.mockResolvedValue(undefined);

    vi.doMock('../../code-scan-action/src/main', () => ({
      run: mocks.run,
    }));
  });

  afterEach(() => {
    vi.resetAllMocks();
    process.env = originalEnv;
  });

  it('runs the action flow when the entrypoint module is imported', async () => {
    await import('../../code-scan-action/src/index');

    await vi.waitFor(() => {
      expect(mocks.run).toHaveBeenCalledTimes(1);
    });
  });
});
