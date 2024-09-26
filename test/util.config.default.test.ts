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

    await expect(loadDefaultConfig()).resolves.toEqual({
      defaultConfig: {},
      defaultConfigPath: undefined,
    });
    expect(maybeReadConfig).toHaveBeenCalledTimes(9); // Once for each extension
  });

  it('should return the first valid config file found', async () => {
    const mockConfig = { prompts: ['Some prompt'], providers: [], tests: [] };
    jest
      .mocked(maybeReadConfig)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(mockConfig);

    await expect(loadDefaultConfig()).resolves.toEqual({
      defaultConfig: mockConfig,
      defaultConfigPath: path.normalize('/test/path/promptfooconfig.json'),
    });
    expect(maybeReadConfig).toHaveBeenCalledTimes(3);
  });

  it('should check all supported file extensions', async () => {
    jest.mocked(maybeReadConfig).mockResolvedValue(undefined);

    await loadDefaultConfig();

    const expectedExtensions = ['yaml', 'yml', 'json', 'cjs', 'cts', 'js', 'mjs', 'mts', 'ts'];
    expectedExtensions.forEach((ext, extIndex) => {
      expect(maybeReadConfig).toHaveBeenNthCalledWith(
        extIndex + 1,
        path.normalize(`/test/path/promptfooconfig.${ext}`),
      );
    });
  });

  it('should use provided directory when specified', async () => {
    const mockConfig = { prompts: ['Some prompt'], providers: [], tests: [] };
    jest.mocked(maybeReadConfig).mockResolvedValueOnce(mockConfig);

    const customDir = '/custom/directory';
    await expect(loadDefaultConfig(customDir)).resolves.toEqual({
      defaultConfig: mockConfig,
      defaultConfigPath: path.join(customDir, 'promptfooconfig.yaml'),
    });
    expect(maybeReadConfig).toHaveBeenCalledWith(path.join(customDir, 'promptfooconfig.yaml'));
  });
});
