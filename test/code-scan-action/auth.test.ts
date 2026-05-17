/**
 * GitHub OIDC Authentication Tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getGitHubOIDCToken } from '../../code-scan-action/src/auth';

const mocks = vi.hoisted(() => ({
  core: {
    getIDToken: vi.fn(),
  },
}));

// Mock both the root specifier and the nested package entry resolved from code-scan-action.
vi.mock('@actions/core', () => mocks.core);
vi.mock('../../code-scan-action/node_modules/@actions/core/lib/core.js', () => mocks.core);

describe('getGitHubOIDCToken', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return OIDC token for given audience', async () => {
    mocks.core.getIDToken.mockResolvedValue('mock-oidc-token');

    const token = await getGitHubOIDCToken('https://scanner.example.com');

    expect(mocks.core.getIDToken).toHaveBeenCalledWith('https://scanner.example.com');
    expect(token).toBe('mock-oidc-token');
  });

  it('should throw error when getIDToken fails', async () => {
    mocks.core.getIDToken.mockRejectedValue(new Error('OIDC not configured'));

    await expect(getGitHubOIDCToken('https://scanner.example.com')).rejects.toThrow(
      'Failed to get GitHub OIDC token: OIDC not configured',
    );
  });
});
