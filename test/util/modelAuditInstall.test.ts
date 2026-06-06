import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getModelAuditCurrentVersion } from '../../src/updates';
import { checkModelAuditInstalled } from '../../src/util/modelAuditInstall';

vi.mock('../../src/updates', () => ({
  getModelAuditCurrentVersion: vi.fn(),
}));

const mockedGetModelAuditCurrentVersion = vi.mocked(getModelAuditCurrentVersion);

describe('checkModelAuditInstalled', () => {
  beforeEach(() => {
    mockedGetModelAuditCurrentVersion.mockReset();
  });

  afterEach(() => {
    mockedGetModelAuditCurrentVersion.mockReset();
  });

  it.each([
    '0.2.16',
    '1.0.0',
    '0.2.19',
  ])('returns the installed version when modelaudit reports %s', async (version) => {
    mockedGetModelAuditCurrentVersion.mockResolvedValue(version);

    await expect(checkModelAuditInstalled()).resolves.toEqual({ installed: true, version });
  });

  it('returns installed false when modelaudit is not installed', async () => {
    mockedGetModelAuditCurrentVersion.mockResolvedValue(null);

    await expect(checkModelAuditInstalled()).resolves.toEqual({ installed: false, version: null });
  });
});
