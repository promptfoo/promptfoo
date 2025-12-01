/**
 * GitHub OIDC Authentication Tests
 */

import * as core from '@actions/core';
import { getGitHubOIDCToken } from '../../code-scan-action/src/auth';

// Mock @actions/core
jest.mock('@actions/core', () => ({
  getIDToken: jest.fn(),
}));

describe('getGitHubOIDCToken', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return OIDC token for given audience', async () => {
    const { getIDToken } = require('@actions/core');
    getIDToken.mockResolvedValue('mock-oidc-token');

    const token = await getGitHubOIDCToken('https://scanner.example.com');

    expect(getIDToken).toHaveBeenCalledWith('https://scanner.example.com');
    expect(token).toBe('mock-oidc-token');
  });

  it('should throw error when getIDToken fails', async () => {
    const { getIDToken } = require('@actions/core');
    getIDToken.mockRejectedValue(new Error('OIDC not configured'));

    await expect(getGitHubOIDCToken('https://scanner.example.com')).rejects.toThrow(
      'Failed to get GitHub OIDC token: OIDC not configured',
    );
  });
});
