import * as fs from 'fs';
import path from 'path';
import { doGenerateRedteam } from '../../src/redteam/commands/generate';
import { doRedteamRun } from '../../src/redteam/shared';
import { checkRemoteHealth } from '../../src/util/apiHealth';
import { loadDefaultConfig } from '../../src/util/config/default';
import FakeDataFactory from '../factories/data/fakeDataFactory';

jest.mock('../../src/redteam/commands/generate');
jest.mock('../../src/commands/eval');
jest.mock('../../src/util/apiHealth');
jest.mock('../../src/util/config/default');
jest.mock('fs');
jest.mock('js-yaml');

describe('doRedteamRun', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(checkRemoteHealth).mockResolvedValue({ status: 'OK', message: 'Healthy' });
    jest.mocked(loadDefaultConfig).mockResolvedValue({
      defaultConfig: {},
      defaultConfigPath: 'promptfooconfig.yaml',
    });
    jest.mocked(fs.existsSync).mockReturnValue(true);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should use default config path when not specified', async () => {
    await doRedteamRun({});
    expect(doGenerateRedteam).toHaveBeenCalledWith(
      expect.objectContaining({
        config: 'promptfooconfig.yaml',
      }),
    );
  });

  it('should use provided config path when specified', async () => {
    const customConfig = 'custom/config.yaml';
    await doRedteamRun({ config: customConfig });
    expect(doGenerateRedteam).toHaveBeenCalledWith(
      expect.objectContaining({
        config: customConfig,
      }),
    );
  });

  it('should use provided output path if specified', async () => {
    const outputPath = 'custom/output.yaml';
    await doRedteamRun({ output: outputPath });
    expect(doGenerateRedteam).toHaveBeenCalledWith(
      expect.objectContaining({
        output: outputPath,
      }),
    );
  });

  it('should locate the out file in the same directory as the config file if output is not specified', async () => {
    // Generate a random directory path
    const dirPath = FakeDataFactory.system.directoryPath();
    const customConfig = `${dirPath}/config.yaml`;
    await doRedteamRun({ config: customConfig });
    expect(doGenerateRedteam).toHaveBeenCalledWith(
      expect.objectContaining({
        config: customConfig,
        output: path.normalize(`${dirPath}/redteam.yaml`),
      }),
    );
  });
});
