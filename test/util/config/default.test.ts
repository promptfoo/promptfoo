import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadDefaultConfig } from '../../../src/util/config/default';
import { maybeReadConfig } from '../../../src/util/config/load';

vi.mock('../../../src/util/config/load', () => ({
  maybeReadConfig: vi.fn(),
}));

describe('loadDefaultConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(process, 'cwd').mockImplementation(() => '/test/path');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return empty config when no config file is found', async () => {
    vi.mocked(maybeReadConfig).mockResolvedValue(undefined);

    const result = await loadDefaultConfig();
    expect(result).toEqual({
      defaultConfig: {},
      defaultConfigPath: undefined,
    });
    expect(maybeReadConfig).toHaveBeenCalledTimes(9);
    expect(maybeReadConfig).toHaveBeenNthCalledWith(
      1,
      path.normalize('/test/path/promptfooconfig.yaml'),
    );
  });

  it('should return the first valid config file found', async () => {
    const mockConfig = { prompts: ['Some prompt'], providers: [], tests: [] };
    vi.mocked(maybeReadConfig)
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

  it('should stop checking extensions after finding a valid config', async () => {
    const mockConfig = { prompts: ['Some prompt'], providers: [], tests: [] };
    vi.mocked(maybeReadConfig).mockResolvedValueOnce(undefined).mockResolvedValueOnce(mockConfig);

    await loadDefaultConfig();

    expect(maybeReadConfig).toHaveBeenCalledTimes(2);
    expect(maybeReadConfig).toHaveBeenNthCalledWith(
      1,
      path.normalize('/test/path/promptfooconfig.yaml'),
    );
    expect(maybeReadConfig).toHaveBeenNthCalledWith(
      2,
      path.normalize('/test/path/promptfooconfig.yml'),
    );
  });

  it('should use provided directory when specified', async () => {
    const mockConfig = { prompts: ['Some prompt'], providers: [], tests: [] };
    vi.mocked(maybeReadConfig).mockResolvedValueOnce(mockConfig);

    const customDir = '/custom/directory';
    const result = await loadDefaultConfig(customDir);
    expect(result).toEqual({
      defaultConfig: mockConfig,
      defaultConfigPath: path.join(customDir, 'promptfooconfig.yaml'),
    });
    expect(maybeReadConfig).toHaveBeenCalledWith(path.join(customDir, 'promptfooconfig.yaml'));
  });

  it('should use custom config name when provided', async () => {
    const mockConfig = { prompts: ['Custom config'], providers: [], tests: [] };
    vi.mocked(maybeReadConfig).mockResolvedValueOnce(mockConfig);

    const result = await loadDefaultConfig(undefined, 'redteam');
    expect(result).toEqual({
      defaultConfig: mockConfig,
      defaultConfigPath: path.normalize('/test/path/redteam.yaml'),
    });
    expect(maybeReadConfig).toHaveBeenCalledWith(path.normalize('/test/path/redteam.yaml'));
  });

  it('should load different config names independently', async () => {
    const mockConfig1 = { prompts: ['Config 1'], providers: [], tests: [] };
    const mockConfig2 = { prompts: ['Config 2'], providers: [], tests: [] };

    vi.mocked(maybeReadConfig)
      .mockResolvedValueOnce(mockConfig1)
      .mockResolvedValueOnce(mockConfig2);

    const result1 = await loadDefaultConfig(undefined, 'promptfooconfig');
    const result2 = await loadDefaultConfig(undefined, 'redteam');

    expect(result1).not.toEqual(result2);
    expect(result1.defaultConfig).toEqual(mockConfig1);
    expect(result2.defaultConfig).toEqual(mockConfig2);

    expect(maybeReadConfig).toHaveBeenCalledTimes(2);
  });

  it('should load different directories independently', async () => {
    const mockConfig1 = { prompts: ['Config 1'], providers: [], tests: [] };
    const mockConfig2 = { prompts: ['Config 2'], providers: [], tests: [] };

    vi.mocked(maybeReadConfig)
      .mockResolvedValueOnce(mockConfig1)
      .mockResolvedValueOnce(mockConfig2);

    const dir1 = '/dir1';
    const dir2 = '/dir2';

    const result1 = await loadDefaultConfig(dir1);
    const result2 = await loadDefaultConfig(dir2);

    expect(result1).not.toEqual(result2);
    expect(result1.defaultConfig).toEqual(mockConfig1);
    expect(result2.defaultConfig).toEqual(mockConfig2);

    expect(maybeReadConfig).toHaveBeenCalledTimes(2);
  });

  it('should handle errors when reading config files', async () => {
    vi.mocked(maybeReadConfig).mockRejectedValue(new Error('Permission denied'));

    await expect(loadDefaultConfig()).rejects.toThrow('Permission denied');
  });

  it('should handle various config names', async () => {
    const mockConfig = { prompts: ['Test config'], providers: [], tests: [] };
    vi.mocked(maybeReadConfig).mockResolvedValue(mockConfig);

    const configNames = ['test1', 'test2', 'test3'];
    for (const name of configNames) {
      const result = await loadDefaultConfig(undefined, name);
      expect(result.defaultConfigPath).toContain(name);
    }
  });

  it('should handle interaction between configName and directory', async () => {
    const mockConfig = { prompts: ['Combined config'], providers: [], tests: [] };
    vi.mocked(maybeReadConfig).mockResolvedValue(mockConfig);

    const customDir = '/custom/dir';
    const customName = 'customconfig';
    const result = await loadDefaultConfig(customDir, customName);

    expect(result.defaultConfigPath).toEqual(path.join(customDir, `${customName}.yaml`));
  });
});
