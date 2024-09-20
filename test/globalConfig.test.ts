import * as fs from 'fs';
import yaml from 'js-yaml';
import { readGlobalConfig, writeGlobalConfig } from '../src/globalConfig/globalConfig';

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  statSync: jest.fn(),
  readdirSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('../src/database');

describe('readCliConfig', () => {
  afterEach(() => {
    jest.clearAllMocks();
    writeGlobalConfig({});
  });

  it('reads from existing config', () => {
    const config = { account: { email: 'test@example.com' } };
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue(yaml.dump(config));

    const result = readGlobalConfig();

    expect(fs.existsSync).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual(config);
  });

  it('creates new config if none exists', () => {
    jest.mocked(fs.existsSync).mockReturnValue(false);
    jest.mocked(fs.writeFileSync).mockImplementation();

    const result = readGlobalConfig();

    expect(fs.existsSync).toHaveBeenCalledTimes(3);
    expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
    expect(result).toEqual({});
  });
});
