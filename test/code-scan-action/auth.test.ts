/**
 * GitHub OIDC Authentication Tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getGitHubOIDCToken } from '../../code-scan-action/src/auth';

// Mock @actions/core
vi.mock('@actions/core', () => ({
  getIDToken: vi.fn(),
}));

describe('getGitHubOIDCToken', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return OIDC token for given audience', async () => {
    const { getIDToken } = await import('@actions/core');
    vi.mocked(getIDToken).mockResolvedValue('mock-oidc-token');

    const token = await getGitHubOIDCToken('https://scanner.example.com');

    expect(getIDToken).toHaveBeenCalledWith('https://scanner.example.com');
    expect(token).toBe('mock-oidc-token');
  });

  it('should throw error when getIDToken fails', async () => {
    const { getIDToken } = await import('@actions/core');
    vi.mocked(getIDToken).mockRejectedValue(new Error('OIDC not configured'));

    await expect(getGitHubOIDCToken('https://scanner.example.com')).rejects.toThrow(
      'Failed to get GitHub OIDC token: OIDC not configured',
    );
  });
});
