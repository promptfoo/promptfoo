import cliState from '../../src/cliState';
import { getEnvBool, getEnvString } from '../../src/envars';
import { readGlobalConfig } from '../../src/globalConfig/globalConfig';
import {
  getRemoteGenerationUrl,
  neverGenerateRemote,
  shouldGenerateRemote,
  getRemoteHealthUrl,
  getRemoteGenerationUrlForUnaligned,
} from '../../src/redteam/remoteGeneration';

jest.mock('../../src/envars');
jest.mock('../../src/envars');
jest.mock('../../src/cliState', () => ({
  remote: undefined,
}));
describe('shouldGenerateRemote', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    cliState.remote = undefined;
  });

  it('should return true when remote generation is not disabled and no OpenAI key exists', () => {
    jest.mocked(getEnvBool).mockReturnValue(false);
    jest.mocked(getEnvString).mockReturnValue('');
    expect(shouldGenerateRemote()).toBe(true);
  });

  it('should return false when remote generation is disabled via env var', () => {
    jest.mocked(getEnvBool).mockReturnValue(true);
    jest.mocked(getEnvString).mockReturnValue('');
    expect(shouldGenerateRemote()).toBe(false);
  });

  it('should return false when OpenAI key exists', () => {
    jest.mocked(getEnvBool).mockReturnValue(false);
    jest.mocked(getEnvString).mockReturnValue('sk-123');
    expect(shouldGenerateRemote()).toBe(false);
  });

  it('should return false when remote generation is disabled via env var and OpenAI key exists', () => {
    jest.mocked(getEnvBool).mockReturnValue(true);
    jest.mocked(getEnvString).mockReturnValue('sk-123');
    expect(shouldGenerateRemote()).toBe(false);
  });

  it('should return true when cliState.remote is true regardless of other conditions', () => {
    jest.mocked(getEnvBool).mockReturnValue(true);
    jest.mocked(getEnvString).mockReturnValue('sk-123');
    cliState.remote = true;
    expect(shouldGenerateRemote()).toBe(true);
  });
});

describe('neverGenerateRemote', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return true when PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION is set to true', () => {
    jest.mocked(getEnvBool).mockReturnValue(true);
    expect(neverGenerateRemote()).toBe(true);
  });

  it('should return false when PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION is set to false', () => {
    jest.mocked(getEnvBool).mockReturnValue(false);
    expect(neverGenerateRemote()).toBe(false);
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
      cloud: {
        apiKey: 'some-api-key',
        apiHost: 'https://cloud.api.com',
      },
    });

    expect(getRemoteGenerationUrl()).toBe('https://cloud.api.com/task');
  });

  it('should return default URL when cloud is disabled and no env URL is set', () => {
    jest.mocked(getEnvString).mockReturnValue('');
    jest.mocked(readGlobalConfig).mockReturnValue({
      cloud: {
        apiKey: undefined,
        apiHost: 'https://cloud.api.com',
      },
    });

    expect(getRemoteGenerationUrl()).toBe('https://api.promptfoo.app/task');
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
      cloud: {
        apiKey: 'some-api-key',
        apiHost: 'https://cloud.api.com',
      },
    });
    expect(getRemoteGenerationUrlForUnaligned()).toBe('https://cloud.api.com/task/harmful');
  });

  it('should return default harmful URL when cloud is disabled', () => {
    jest.mocked(getEnvString).mockReturnValue('');
    jest.mocked(readGlobalConfig).mockReturnValue({
      cloud: {
        apiKey: undefined,
        apiHost: 'https://cloud.api.com',
      },
    });
    expect(getRemoteGenerationUrlForUnaligned()).toBe('https://api.promptfoo.app/task/harmful');
  });
});
