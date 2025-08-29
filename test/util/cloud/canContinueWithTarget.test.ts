import { randomUUID } from 'crypto';

import { CLOUD_PROVIDER_PREFIX } from '../../../src/constants';
import { canContinueWithTarget } from '../../../src/util/cloud/canContinueWithTarget';

jest.mock('../../../src/util/cloud', () => ({
  ...jest.requireActual('../../../src/util/cloud'),
  checkIfCliTargetExists: jest.fn(),
  canCreateTargets: jest.fn(),
  getDefaultTeam: jest.fn(),
}));
jest.mock('../../../src/logger');

describe('canContinueWithTarget', () => {
  let mockCheckIfCliTargetExists: jest.Mock;
  let mockCanCreateTargets: jest.Mock;
  let mockGetDefaultTeam: jest.Mock;
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();

    // Get fresh references to mocked functions
    const cloudMocks = jest.requireMock('../../../src/util/cloud');
    mockCheckIfCliTargetExists = cloudMocks.checkIfCliTargetExists;
    mockCanCreateTargets = cloudMocks.canCreateTargets;
    mockGetDefaultTeam = cloudMocks.getDefaultTeam;

    mockLogger = jest.requireMock('../../../src/logger').default;
    mockLogger.debug = jest.fn();
    mockLogger.info = jest.fn();
    mockLogger.warn = jest.fn();
    mockLogger.error = jest.fn();
  });

  it('should return true when providers is undefined', async () => {
    const result = await canContinueWithTarget(undefined, 'team-123');

    expect(result).toBe(true);
  });

  it('should return true when providers array is empty', async () => {
    const result = await canContinueWithTarget([], 'team-123');

    expect(result).toBe(true);
  });

  it('should return true when all providers are cloud providers', async () => {
    const providers = [
      { id: `${CLOUD_PROVIDER_PREFIX}${randomUUID()}` },
      `${CLOUD_PROVIDER_PREFIX}${randomUUID()}`,
    ];

    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(true);
    expect(mockCheckIfCliTargetExists).not.toHaveBeenCalled();
  });

  it('should use default team when teamId is not provided', async () => {
    const providers = [{ id: 'custom-provider', config: {} }];
    mockCheckIfCliTargetExists.mockResolvedValue(true);
    mockGetDefaultTeam.mockResolvedValue({ id: 'default-team-id', name: 'Default Team' });

    const result = await canContinueWithTarget(providers, undefined);

    expect(result).toBe(true);
    expect(mockGetDefaultTeam).toHaveBeenCalled();
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('custom-provider', 'default-team-id');
  });

  it('should handle error when getting default team', async () => {
    const providers = [{ id: 'custom-provider', config: {} }];
    mockCheckIfCliTargetExists.mockResolvedValue(true);
    mockGetDefaultTeam.mockRejectedValue(new Error('Failed to get team'));

    const result = await canContinueWithTarget(providers, undefined);

    expect(result).toBe(true);

    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('custom-provider', '');
  });

  it('should return true when non-cloud provider exists', async () => {
    const providers = [{ id: 'custom-provider', config: {} }, 'openai'];
    mockCheckIfCliTargetExists.mockResolvedValue(true);

    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(true);
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('custom-provider', 'team-123');
  });

  it('should return true when provider does not exist but can be created', async () => {
    const providers = [{ id: 'custom-provider', config: {} }, 'provider-2'];
    mockCheckIfCliTargetExists.mockResolvedValue(false);
    mockCanCreateTargets.mockResolvedValue(true);

    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(true);
    expect(mockCanCreateTargets).toHaveBeenCalledWith('team-123');
  });

  it('should return false when provider does not exist and cannot be created', async () => {
    const providers = [{ id: 'custom-provider', config: {} }];
    mockCheckIfCliTargetExists.mockResolvedValue(false);
    mockCanCreateTargets.mockResolvedValue(false);

    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(false);
  });

  it('should continue when canCreateTargets throws an error', async () => {
    const providers = [{ id: 'custom-provider', config: {} }];
    mockCheckIfCliTargetExists.mockResolvedValue(false);
    mockCanCreateTargets.mockRejectedValue(new Error('Permission check failed'));

    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(true);
  });

  it('should handle mixed cloud and non-cloud providers', async () => {
    const providers = [
      `${CLOUD_PROVIDER_PREFIX}123`,
      { id: 'custom-provider', config: {} },
      `${CLOUD_PROVIDER_PREFIX}456`,
    ];
    mockCheckIfCliTargetExists.mockResolvedValue(true);

    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(true);
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledTimes(1);
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('custom-provider', 'team-123');
  });

  it('should handle provider as a single string instead of array', async () => {
    const provider = 'custom-provider';
    mockCheckIfCliTargetExists.mockResolvedValue(true);

    const result = await canContinueWithTarget(provider, 'team-123');

    expect(result).toBe(true);
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('custom-provider', 'team-123');
  });

  it('should skip cloud providers when checking permissions', async () => {
    const providers = [
      { id: `${CLOUD_PROVIDER_PREFIX}openai:gpt-4`, config: {} },
      { id: 'custom-provider', config: {} },
      { id: `${CLOUD_PROVIDER_PREFIX}anthropic:claude-3`, config: {} },
    ];
    mockCheckIfCliTargetExists.mockResolvedValue(true);

    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(true);
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledTimes(1);
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('custom-provider', 'team-123');
  });

  it('should return true when all non-cloud providers have no identifiers', async () => {
    const providers = [
      { config: {} }, // No id field
      `${CLOUD_PROVIDER_PREFIX}openai:gpt-4`, // Cloud provider
    ];

    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(true);
    expect(mockCheckIfCliTargetExists).not.toHaveBeenCalled();
  });

  it('should check multiple non-cloud providers and return false on first permission failure', async () => {
    const providers = [
      { id: 'provider-1', config: {} },
      { id: 'provider-2', config: {} },
      { id: 'provider-3', config: {} },
    ];
    mockCheckIfCliTargetExists.mockImplementation(async (identifier: string) => {
      return identifier === 'provider-1'; // Only provider-1 exists
    });
    mockCanCreateTargets.mockResolvedValue(false); // Cannot create new targets

    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(false);
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledTimes(2); // Stops at provider-2
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('provider-1', 'team-123');
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('provider-2', 'team-123');
    expect(mockCanCreateTargets).toHaveBeenCalledTimes(1);
    expect(mockCanCreateTargets).toHaveBeenCalledWith('team-123');
  });

  it('should handle provider with file path correctly', async () => {
    const providers = ['file:///path/to/provider.js'];
    mockCheckIfCliTargetExists.mockResolvedValue(true);

    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(true);
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith(
      'file:///path/to/provider.js',
      'team-123',
    );
  });

  it('should handle provider config objects correctly', async () => {
    const providers = [
      {
        id: 'custom-id',
        config: { apiKey: 'test' },
      },
    ];
    mockCheckIfCliTargetExists.mockResolvedValue(true);

    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(true);
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('custom-id', 'team-123');
  });

  it('should handle providers with undefined team correctly', async () => {
    const providers = [{ id: 'custom-provider', config: {} }];
    mockCheckIfCliTargetExists.mockResolvedValue(false);
    mockCanCreateTargets.mockResolvedValue(true);
    mockGetDefaultTeam.mockResolvedValue({ id: 'default-team', name: 'Default' });

    const result = await canContinueWithTarget(providers, undefined);

    expect(result).toBe(true);
    expect(mockGetDefaultTeam).toHaveBeenCalled();
    expect(mockCanCreateTargets).toHaveBeenCalledWith('default-team');
  });

  it('should use label instead of id when checking if CLI target exists', async () => {
    const providers = [
      { 
        id: 'custom-provider-id',
        label: 'custom-provider-label',
        config: {} 
      }
    ];
    mockCheckIfCliTargetExists.mockResolvedValue(true);

    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(true);
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('custom-provider-label', 'team-123');
    expect(mockCheckIfCliTargetExists).not.toHaveBeenCalledWith('custom-provider-id', 'team-123');
  });

  it('should use id when label is not present', async () => {
    const providers = [
      { 
        id: 'custom-provider-id',
        config: {} 
      }
    ];
    mockCheckIfCliTargetExists.mockResolvedValue(true);

    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(true);
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('custom-provider-id', 'team-123');
  });

  it('should handle provider function with label using label instead of id', async () => {
    // Test providers passed as a function (which is one of the UnifiedConfig['providers'] types)
    // Since canContinueWithTarget expects the providers directly, not a function
    // We need to test with the actual provider object
    const providers = [{ id: 'provider-id', label: 'provider-label', config: {} }];
    mockCheckIfCliTargetExists.mockResolvedValue(true);
    
    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(true);
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('provider-label', 'team-123');
    expect(mockCheckIfCliTargetExists).not.toHaveBeenCalledWith('provider-id', 'team-123');
  });

  it('should handle provider with transform property', async () => {
    const providers = [
      { 
        id: 'transformed-provider',
        label: 'transformed-label',
        transform: 'response.data',
        config: {} 
      }
    ];
    mockCheckIfCliTargetExists.mockResolvedValue(true);

    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(true);
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('transformed-label', 'team-123');
  });

  it('should handle provider with empty string label falling back to id', async () => {
    const providers = [
      { 
        id: 'provider-id',
        label: '',
        config: {} 
      }
    ];
    mockCheckIfCliTargetExists.mockResolvedValue(true);

    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(true);
    // Empty string label should be ignored, falling back to id
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('provider-id', 'team-123');
  });

  it('should handle provider with neither id nor label returning undefined identifier', async () => {
    const providers = [
      { 
        config: { someConfig: 'value' },
        // No id or label
      },
      { 
        id: 'valid-provider',
        config: {} 
      }
    ];
    mockCheckIfCliTargetExists.mockResolvedValue(true);

    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(true);
    // Should only check the provider with valid identifier
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledTimes(1);
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('valid-provider', 'team-123');
  });

  it('should handle mixed provider types in same array', async () => {
    const providers = [
      'string-provider',  // String provider
      { id: 'object-provider', label: 'object-label', config: {} },  // ProviderOptions with label
      { id: 'provider-without-label', config: {} },  // ProviderOptions without label
      { id: 'simple-object' },  // Simple object with id
      `${CLOUD_PROVIDER_PREFIX}cloud-provider`,  // Cloud provider (should be skipped)
    ];
    mockCheckIfCliTargetExists.mockResolvedValue(true);

    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(true);
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledTimes(4);
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('string-provider', 'team-123');
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('object-label', 'team-123');
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('provider-without-label', 'team-123');
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('simple-object', 'team-123');
  });

  it('should handle exec: and python: prefixed providers', async () => {
    const providers = [
      'exec:custom-script',  // Without path separators, stays as-is
      'python:provider',     // Without path separators, stays as-is
      'file:///absolute/path/provider.js',  // Absolute path with file://
    ];
    mockCheckIfCliTargetExists.mockResolvedValue(true);

    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(true);
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledTimes(3);
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('exec:custom-script', 'team-123');
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('python:provider', 'team-123');
    // Since file:// with relative path gets resolved, we check what was actually called
    const calls = mockCheckIfCliTargetExists.mock.calls;
    expect(calls[2][0]).toMatch(/^file:\/\/.*\/absolute\/path\/provider\.js$/);
  });

  it('should handle providers with path resolution', async () => {
    const path = require('path');
    const providers = [
      'exec:./custom-script.sh',  // Relative path - will be resolved
      'python:./provider.py',      // Relative path - will be resolved
    ];
    mockCheckIfCliTargetExists.mockResolvedValue(true);

    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(true);
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledTimes(2);
    // Check that paths were resolved to absolute paths
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith(
      `exec:${path.resolve('./custom-script.sh')}`, 
      'team-123'
    );
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith(
      `python:${path.resolve('./provider.py')}`, 
      'team-123'
    );
  });

  it('should handle provider with only label (no id)', async () => {
    const providers = [
      { 
        label: 'provider-with-only-label',
        config: {} 
      }
    ];
    mockCheckIfCliTargetExists.mockResolvedValue(true);

    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(true);
    // Provider with only label but no id should still work
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledTimes(1);
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('provider-with-only-label', 'team-123');
  });

  it('should handle golang: prefixed providers', async () => {
    const providers = [
      'golang:provider',  // Without path separators
      'golang:./custom-provider.go',  // With relative path
    ];
    mockCheckIfCliTargetExists.mockResolvedValue(true);

    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(true);
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledTimes(2);
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('golang:provider', 'team-123');
    // Second one will have resolved path
    const calls = mockCheckIfCliTargetExists.mock.calls;
    expect(calls[1][0]).toMatch(/^golang:.*custom-provider\.go$/);
  });

  it('should handle providers with delay property', async () => {
    const providers = [
      { 
        id: 'delayed-provider',
        label: 'Delayed Provider',
        delay: 1000,
        config: {} 
      }
    ];
    mockCheckIfCliTargetExists.mockResolvedValue(true);

    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(true);
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('Delayed Provider', 'team-123');
  });
});
