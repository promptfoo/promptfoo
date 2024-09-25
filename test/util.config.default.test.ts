import path from 'path';
import { loadDefaultConfig } from '../src/util/config/default';
import { maybeReadConfig } from '../src/util/config/load';

jest.mock('../src/util/config/load', () => ({
  maybeReadConfig: jest.fn(),
}));

describe('loadDefaultConfig', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(process, 'cwd').mockImplementation().mockReturnValue('/test/path');
  });

  it('should return empty config when no config file is found', async () => {
    jest.mocked(maybeReadConfig).mockResolvedValue(undefined);

    const result = await loadDefaultConfig(['redteam', 'promptfooconfig']);

    expect(result).toEqual({
      defaultConfig: {},
      defaultConfigPath: undefined,
    });
    expect(maybeReadConfig).toHaveBeenCalledTimes(18); // Once for each extension * 2 (redteam and promptfooconfig)
  });

  it('should return the first valid config file found', async () => {
    const mockConfig = { prompts: ['Some prompt'], providers: [], tests: [] };
    jest
      .mocked(maybeReadConfig)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(mockConfig);

    const result = await loadDefaultConfig(['redteam', 'promptfooconfig']);

    expect(result).toEqual({
      defaultConfig: mockConfig,
      defaultConfigPath: path.normalize('/test/path/redteam.yml'),
    });
    expect(maybeReadConfig).toHaveBeenCalledTimes(3);
  });

  it('should check all supported file extensions', async () => {
    jest.mocked(maybeReadConfig).mockResolvedValue(undefined);

    await loadDefaultConfig(['redteam', 'promptfooconfig']);

    const expectedExtensions = ['yaml', 'yml', 'json', 'cjs', 'cts', 'js', 'mjs', 'mts', 'ts'];
    expectedExtensions.forEach((ext, extIndex) => {
      ['redteam', 'promptfooconfig'].forEach((configName, index) => {
        expect(maybeReadConfig).toHaveBeenNthCalledWith(
          extIndex * 2 + index + 1,
          path.normalize(`/test/path/${configName}.${ext}`),
        );
      });
    });
  });

  it('should use provided directory when specified', async () => {
    const mockConfig = { prompts: ['Some prompt'], providers: [], tests: [] };
    jest.mocked(maybeReadConfig).mockResolvedValueOnce(mockConfig);

    const customDir = '/custom/directory';
    const result = await loadDefaultConfig(['redteam', 'promptfooconfig'], customDir);

    expect(result).toEqual({
      defaultConfig: mockConfig,
      defaultConfigPath: path.join(customDir, 'redteam.yaml'),
    });
    expect(maybeReadConfig).toHaveBeenCalledWith(path.join(customDir, 'redteam.yaml'));
  });
});
