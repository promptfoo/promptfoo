import cliState from '../../src/cliState';
import { getEnvBool, getEnvString } from '../../src/envars';
import { readGlobalConfig } from '../../src/globalConfig/globalConfig';
import {
  getRemoteGenerationUrl,
  neverGenerateRemote,
  shouldGenerateRemote,
} from '../../src/redteam/remoteGeneration';

jest.mock('../../src/envars');
jest.mock('../../src/globalConfig/globalConfig');
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
