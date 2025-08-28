import { canContinueWithTarget } from '../../src/redteam/shared';

jest.mock('../../src/util/cloud');
jest.mock('../../src/logger');

describe('canContinueWithTarget', () => {
  const mockIsCloudProvider = jest.requireMock('../../src/util/cloud').isCloudProvider;
  const mockCheckIfCliTargetExists =
    jest.requireMock('../../src/util/cloud').checkIfCliTargetExists;
  const mockCanCreateTargets = jest.requireMock('../../src/util/cloud').canCreateTargets;
  const mockGetDefaultTeam = jest.requireMock('../../src/util/cloud').getDefaultTeam;
  const mockLogger = jest.requireMock('../../src/logger').default;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger.debug = jest.fn();
    mockLogger.info = jest.fn();
    mockLogger.warn = jest.fn();
    mockLogger.error = jest.fn();
  });

  it('should return true when providers is undefined', async () => {
    const result = await canContinueWithTarget(undefined, 'team-123');

    expect(result).toBe(true);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      '[canContinueWithTarget] Checking provider permissions for undefined on team team-123',
    );
  });

  it('should return true when providers array is empty', async () => {
    const result = await canContinueWithTarget([], 'team-123');

    expect(result).toBe(true);
  });

  it('should return true when all providers are cloud providers', async () => {
    const providers = ['openai:gpt-4', 'anthropic:claude-3'];
    mockIsCloudProvider.mockReturnValue(true);

    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(true);
    expect(mockIsCloudProvider).toHaveBeenCalledTimes(2);
    expect(mockIsCloudProvider).toHaveBeenCalledWith('openai:gpt-4');
    expect(mockIsCloudProvider).toHaveBeenCalledWith('anthropic:claude-3');
  });

  it('should use default team when teamId is not provided', async () => {
    const providers = [{ id: 'custom-provider', config: {} }];
    mockIsCloudProvider.mockReturnValue(false);
    mockCheckIfCliTargetExists.mockResolvedValue(true);
    mockGetDefaultTeam.mockResolvedValue({ id: 'default-team-id', name: 'Default Team' });

    const result = await canContinueWithTarget(providers, undefined);

    expect(result).toBe(true);
    expect(mockGetDefaultTeam).toHaveBeenCalled();
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('custom-provider', 'default-team-id');
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Using default team Default Team (default-team-id)',
    );
  });

  it('should handle error when getting default team', async () => {
    const providers = [{ id: 'custom-provider', config: {} }];
    mockIsCloudProvider.mockReturnValue(false);
    mockCheckIfCliTargetExists.mockResolvedValue(true);
    mockGetDefaultTeam.mockRejectedValue(new Error('Failed to get team'));

    const result = await canContinueWithTarget(providers, undefined);

    expect(result).toBe(true);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Failed to get default team: Error: Failed to get team',
    );
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('custom-provider', '');
  });

  it('should return true when non-cloud provider exists', async () => {
    const providers = [{ id: 'custom-provider', config: {} }];
    mockIsCloudProvider.mockReturnValue(false);
    mockCheckIfCliTargetExists.mockResolvedValue(true);

    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(true);
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('custom-provider', 'team-123');
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Provider custom-provider exists on team team-123',
    );
  });

  it('should return true when provider does not exist but can be created', async () => {
    const providers = [{ id: 'custom-provider', config: {} }];
    mockIsCloudProvider.mockReturnValue(false);
    mockCheckIfCliTargetExists.mockResolvedValue(false);
    mockCanCreateTargets.mockResolvedValue(true);

    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(true);
    expect(mockCanCreateTargets).toHaveBeenCalledWith('team-123');
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Provider custom-provider does not exist on team team-123, but can be created',
    );
  });

  it('should return false when provider does not exist and cannot be created', async () => {
    const providers = [{ id: 'custom-provider', config: {} }];
    mockIsCloudProvider.mockReturnValue(false);
    mockCheckIfCliTargetExists.mockResolvedValue(false);
    mockCanCreateTargets.mockResolvedValue(false);

    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(false);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Provider custom-provider does not exist on team team-123 and cannot be created. User does not have permissions.',
    );
  });

  it('should continue when canCreateTargets throws an error', async () => {
    const providers = [{ id: 'custom-provider', config: {} }];
    mockIsCloudProvider.mockReturnValue(false);
    mockCheckIfCliTargetExists.mockResolvedValue(false);
    mockCanCreateTargets.mockRejectedValue(new Error('Permission check failed'));

    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(true);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Error checking if user can create targets: Error: Permission check failed. Continuing anyway.',
    );
  });

  it('should handle mixed cloud and non-cloud providers', async () => {
    const providers = ['openai:gpt-4', { id: 'custom-provider', config: {} }, 'anthropic:claude-3'];
    mockIsCloudProvider.mockImplementation(
      (id) => id.includes('openai') || id.includes('anthropic'),
    );
    mockCheckIfCliTargetExists.mockResolvedValue(true);

    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(true);
    expect(mockIsCloudProvider).toHaveBeenCalledTimes(5); // Once for all check, then once per provider
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('custom-provider', 'team-123');
  });

  it('should handle provider as a single string instead of array', async () => {
    const provider = 'custom-provider';
    mockIsCloudProvider.mockReturnValue(false);
    mockCheckIfCliTargetExists.mockResolvedValue(true);

    const result = await canContinueWithTarget(provider, 'team-123');

    expect(result).toBe(true);
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('custom-provider', 'team-123');
  });

  it('should skip cloud providers when checking permissions', async () => {
    const providers = [
      { id: 'openai:gpt-4', config: {} },
      { id: 'custom-provider', config: {} },
      { id: 'anthropic:claude-3', config: {} },
    ];
    mockIsCloudProvider.mockImplementation(
      (id) => id.includes('openai') || id.includes('anthropic'),
    );
    mockCheckIfCliTargetExists.mockResolvedValue(true);

    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(true);
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledTimes(1);
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('custom-provider', 'team-123');
  });

  it('should return true when all non-cloud providers have no identifiers', async () => {
    const providers = [
      { config: {} }, // No id field
      'openai:gpt-4', // Cloud provider
    ];
    mockIsCloudProvider.mockImplementation((id) => id === 'openai:gpt-4');

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
    mockIsCloudProvider.mockReturnValue(false);
    mockCheckIfCliTargetExists.mockImplementation(async (identifier) => {
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
    mockIsCloudProvider.mockReturnValue(false);
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
    mockIsCloudProvider.mockReturnValue(false);
    mockCheckIfCliTargetExists.mockResolvedValue(true);

    const result = await canContinueWithTarget(providers, 'team-123');

    expect(result).toBe(true);
    expect(mockCheckIfCliTargetExists).toHaveBeenCalledWith('custom-id', 'team-123');
  });

  it('should handle providers with undefined team correctly', async () => {
    const providers = [{ id: 'custom-provider', config: {} }];
    mockIsCloudProvider.mockReturnValue(false);
    mockCheckIfCliTargetExists.mockResolvedValue(false);
    mockCanCreateTargets.mockResolvedValue(true);
    mockGetDefaultTeam.mockResolvedValue({ id: 'default-team', name: 'Default' });

    const result = await canContinueWithTarget(providers, undefined);

    expect(result).toBe(true);
    expect(mockGetDefaultTeam).toHaveBeenCalled();
    expect(mockCanCreateTargets).toHaveBeenCalledWith('default-team');
  });
});
