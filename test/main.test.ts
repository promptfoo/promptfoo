import path from 'path';
import { maybeReadConfig } from '../src/config';
import { loadDefaultConfig } from '../src/main';

jest.mock('../src/config', () => ({
  maybeReadConfig: jest.fn(),
}));

describe('loadDefaultConfig', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(process, 'cwd').mockImplementation().mockReturnValue('/test/path');
  });

  it('should return empty config when no config file is found', async () => {
    jest.mocked(maybeReadConfig).mockResolvedValue(undefined);

    const result = await loadDefaultConfig();

    expect(result).toEqual({
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

    const result = await loadDefaultConfig();

    expect(result).toEqual({
      defaultConfig: mockConfig,
      defaultConfigPath: path.normalize('/test/path/promptfooconfig.json'),
    });
    expect(maybeReadConfig).toHaveBeenCalledTimes(3);
  });

  it('should check all supported file extensions', async () => {
    jest.mocked(maybeReadConfig).mockResolvedValue(undefined);

    await loadDefaultConfig();

    const expectedExtensions = ['yaml', 'yml', 'json', 'cjs', 'cts', 'js', 'mjs', 'mts', 'ts'];
    expectedExtensions.forEach((ext, index) => {
      expect(maybeReadConfig).toHaveBeenNthCalledWith(
        index + 1,
        path.normalize(`/test/path/promptfooconfig.${ext}`),
      );
    });
  });
});
