import cliState from '../../src/cliState';
import { getEnvBool, getEnvString } from '../../src/envars';
import { isLoggedIntoCloud } from '../../src/globalConfig/accounts';
import { readGlobalConfig } from '../../src/globalConfig/globalConfig';
import {
  getRemoteGenerationUrl,
  getRemoteGenerationUrlForUnaligned,
  getRemoteHealthUrl,
  neverGenerateRemote,
  neverGenerateRemoteForRegularEvals,
  shouldGenerateRemote,
} from '../../src/redteam/remoteGeneration';

jest.mock('../../src/envars');
jest.mock('../../src/globalConfig/accounts');
jest.mock('../../src/globalConfig/globalConfig');
jest.mock('../../src/cliState', () => ({
  remote: undefined,
}));

describe('shouldGenerateRemote', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    cliState.remote = undefined;
    jest.mocked(isLoggedIntoCloud).mockReturnValue(false);
  });

  it('should return false when remote generation is explicitly disabled, even for cloud users', () => {
    jest.mocked(isLoggedIntoCloud).mockReturnValue(true);
    jest.mocked(getEnvBool).mockReturnValue(true); // neverGenerateRemote = true
    expect(shouldGenerateRemote()).toBe(false);
  });

  it('should return true when logged into cloud and remote generation is not disabled', () => {
    jest.mocked(isLoggedIntoCloud).mockReturnValue(true);
    jest.mocked(getEnvBool).mockReturnValue(false); // neverGenerateRemote = false
    jest.mocked(getEnvString).mockReturnValue('sk-123'); // Has OpenAI key
    expect(shouldGenerateRemote()).toBe(true);
  });

  it('should follow normal logic when not logged into cloud', () => {
    jest.mocked(isLoggedIntoCloud).mockReturnValue(false);
    jest.mocked(getEnvBool).mockReturnValue(false);
    jest.mocked(getEnvString).mockReturnValue('');
    expect(shouldGenerateRemote()).toBe(true);
  });

  it('should return true when remote generation is not disabled and no OpenAI key exists', () => {
    jest.mocked(isLoggedIntoCloud).mockReturnValue(false);
    jest.mocked(getEnvBool).mockReturnValue(false);
    jest.mocked(getEnvString).mockReturnValue('');
    expect(shouldGenerateRemote()).toBe(true);
  });

  it('should return false when remote generation is disabled via env var', () => {
    jest.mocked(isLoggedIntoCloud).mockReturnValue(false);
    jest.mocked(getEnvBool).mockReturnValue(true);
    jest.mocked(getEnvString).mockReturnValue('');
    expect(shouldGenerateRemote()).toBe(false);
  });

  it('should return false when OpenAI key exists and not logged into cloud', () => {
    jest.mocked(isLoggedIntoCloud).mockReturnValue(false);
    jest.mocked(getEnvBool).mockReturnValue(false);
    jest.mocked(getEnvString).mockReturnValue('sk-123');
    expect(shouldGenerateRemote()).toBe(false);
  });

  it('should return false when remote generation is disabled and OpenAI key exists', () => {
    jest.mocked(isLoggedIntoCloud).mockReturnValue(false);
    jest.mocked(getEnvBool).mockReturnValue(true);
    jest.mocked(getEnvString).mockReturnValue('sk-123');
    expect(shouldGenerateRemote()).toBe(false);
  });

  it('should return true when cliState.remote is true regardless of OpenAI key', () => {
    jest.mocked(isLoggedIntoCloud).mockReturnValue(false);
    jest.mocked(getEnvBool).mockReturnValue(false);
    jest.mocked(getEnvString).mockReturnValue('sk-123');
    cliState.remote = true;
    expect(shouldGenerateRemote()).toBe(true);
  });

  it('should return false when cliState.remote is true but neverGenerateRemote is true', () => {
    jest.mocked(isLoggedIntoCloud).mockReturnValue(false);
    jest.mocked(getEnvBool).mockReturnValue(true); // neverGenerateRemote = true
    jest.mocked(getEnvString).mockReturnValue('sk-123');
    cliState.remote = true;
    expect(shouldGenerateRemote()).toBe(false);
  });
});

describe('neverGenerateRemote', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return true when PROMPTFOO_DISABLE_REMOTE_GENERATION is set', () => {
    jest
      .mocked(getEnvBool)
      .mockImplementation((key: string) => key === 'PROMPTFOO_DISABLE_REMOTE_GENERATION');
    expect(neverGenerateRemote()).toBe(true);
  });

  it('should return true when PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION is set', () => {
    jest
      .mocked(getEnvBool)
      .mockImplementation((key: string) => key === 'PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION');
    expect(neverGenerateRemote()).toBe(true);
  });

  it('should return true when both PROMPTFOO_DISABLE_REMOTE_GENERATION and PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION are set (superset wins)', () => {
    jest.mocked(getEnvBool).mockReturnValue(true);
    expect(neverGenerateRemote()).toBe(true);
  });

  it('should return false when neither flag is set', () => {
    jest.mocked(getEnvBool).mockReturnValue(false);
    expect(neverGenerateRemote()).toBe(false);
  });

  it('should prioritize PROMPTFOO_DISABLE_REMOTE_GENERATION over PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION', () => {
    // First call checks PROMPTFOO_DISABLE_REMOTE_GENERATION (returns true)
    // Second call would check PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION (not reached)
    jest
      .mocked(getEnvBool)
      .mockImplementation((key: string) => key === 'PROMPTFOO_DISABLE_REMOTE_GENERATION');
    expect(neverGenerateRemote()).toBe(true);
  });
});

describe('neverGenerateRemoteForRegularEvals', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return true when PROMPTFOO_DISABLE_REMOTE_GENERATION is set', () => {
    jest
      .mocked(getEnvBool)
      .mockImplementation((key: string) => key === 'PROMPTFOO_DISABLE_REMOTE_GENERATION');
    expect(neverGenerateRemoteForRegularEvals()).toBe(true);
  });

  it('should return false when PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION is set (redteam-specific should not affect regular evals)', () => {
    jest
      .mocked(getEnvBool)
      .mockImplementation((key: string) => key === 'PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION');
    expect(neverGenerateRemoteForRegularEvals()).toBe(false);
  });

  it('should return false when neither flag is set', () => {
    jest.mocked(getEnvBool).mockReturnValue(false);
    expect(neverGenerateRemoteForRegularEvals()).toBe(false);
  });

  it('should only check PROMPTFOO_DISABLE_REMOTE_GENERATION (not the redteam-specific flag)', () => {
    jest
      .mocked(getEnvBool)
      .mockImplementation((key: string) => key === 'PROMPTFOO_DISABLE_REMOTE_GENERATION');
    expect(neverGenerateRemoteForRegularEvals()).toBe(true);
    // Verify getEnvBool was called only once with the correct key
    expect(getEnvBool).toHaveBeenCalledTimes(1);
    expect(getEnvBool).toHaveBeenCalledWith('PROMPTFOO_DISABLE_REMOTE_GENERATION');
  });
});

describe('getRemoteGenerationUrl', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return env URL + /task when PROMPTFOO_REMOTE_GENERATION_URL is set', () => {
    jest.mocked(getEnvString).mockReturnValue('https://custom.api.com/task');
    expect(getRemoteGenerationUrl()).toBe('https://custom.api.com/task');
  });

  it('should return cloud API host + /task when cloud is enabled and no env URL is set', () => {
    jest.mocked(getEnvString).mockReturnValue('');
    jest.mocked(readGlobalConfig).mockReturnValue({
      id: 'test-id',
      cloud: {
        apiKey: 'some-api-key',
        apiHost: 'https://cloud.api.com',
      },
    });

    expect(getRemoteGenerationUrl()).toBe('https://cloud.api.com/api/v1/task');
  });

  it('should return default URL when cloud is disabled and no env URL is set', () => {
    jest.mocked(getEnvString).mockReturnValue('');
    jest.mocked(readGlobalConfig).mockReturnValue({
      id: 'test-id',
      cloud: {
        apiKey: undefined,
        apiHost: 'https://cloud.api.com',
      },
    });

    expect(getRemoteGenerationUrl()).toBe('https://api.promptfoo.app/api/v1/task');
  });
});

describe('getRemoteHealthUrl', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return null when remote generation is disabled', () => {
    jest.mocked(getEnvBool).mockReturnValue(true); // neverGenerateRemote = true
    expect(getRemoteHealthUrl()).toBeNull();
  });

  it('should return modified env URL with /health path when PROMPTFOO_REMOTE_GENERATION_URL is set', () => {
    jest.mocked(getEnvBool).mockReturnValue(false);
    jest.mocked(getEnvString).mockReturnValue('https://custom.api.com/task');
    expect(getRemoteHealthUrl()).toBe('https://custom.api.com/health');
  });

  it('should return default health URL when env URL is invalid', () => {
    jest.mocked(getEnvBool).mockReturnValue(false);
    jest.mocked(getEnvString).mockReturnValue('invalid-url');
    expect(getRemoteHealthUrl()).toBe('https://api.promptfoo.app/health');
  });

  it('should return cloud API health URL when cloud is enabled', () => {
    jest.mocked(getEnvBool).mockReturnValue(false);
    jest.mocked(getEnvString).mockReturnValue('');
    jest.mocked(readGlobalConfig).mockReturnValue({
      id: 'test-id',
      cloud: {
        apiKey: 'some-api-key',
        apiHost: 'https://cloud.api.com',
      },
    });
    expect(getRemoteHealthUrl()).toBe('https://cloud.api.com/health');
  });

  it('should return default health URL when cloud is disabled', () => {
    jest.mocked(getEnvBool).mockReturnValue(false);
    jest.mocked(getEnvString).mockReturnValue('');
    jest.mocked(readGlobalConfig).mockReturnValue({
      id: 'test-id',
      cloud: {
        apiKey: undefined,
        apiHost: 'https://cloud.api.com',
      },
    });
    expect(getRemoteHealthUrl()).toBe('https://api.promptfoo.app/health');
  });
});

describe('getRemoteGenerationUrlForUnaligned', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return env URL when PROMPTFOO_UNALIGNED_INFERENCE_ENDPOINT is set', () => {
    jest.mocked(getEnvString).mockReturnValue('https://custom.api.com/harmful');
    expect(getRemoteGenerationUrlForUnaligned()).toBe('https://custom.api.com/harmful');
  });

  it('should return cloud API harmful URL when cloud is enabled', () => {
    jest.mocked(getEnvString).mockReturnValue('');
    jest.mocked(readGlobalConfig).mockReturnValue({
      id: 'test-id',
      cloud: {
        apiKey: 'some-api-key',
        apiHost: 'https://cloud.api.com',
      },
    });
    expect(getRemoteGenerationUrlForUnaligned()).toBe('https://cloud.api.com/api/v1/task/harmful');
  });

  it('should return default harmful URL when cloud is disabled', () => {
    jest.mocked(getEnvString).mockReturnValue('');
    jest.mocked(readGlobalConfig).mockReturnValue({
      id: 'test-id',
      cloud: {
        apiKey: undefined,
        apiHost: 'https://cloud.api.com',
      },
    });
    expect(getRemoteGenerationUrlForUnaligned()).toBe(
      'https://api.promptfoo.app/api/v1/task/harmful',
    );
  });
});
