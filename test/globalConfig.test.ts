import { faker } from '@faker-js/faker';
import * as fs from 'fs';
import yaml from 'js-yaml';
import { GlobalConfig } from '../src/configTypes';
import {
  clearGlobalConfigCache,
  readGlobalConfig,
  writeGlobalConfig,
  writeGlobalConfigPartial,
} from '../src/globalConfig/globalConfig';

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

describe('readGlobalConfig', () => {
  beforeEach(() => {
    writeGlobalConfig({});
    clearGlobalConfigCache();
    jest.clearAllMocks();
  });

  it('reads from cache on subsequent calls', () => {
    const config = { account: { email: 'test@example.com' } };
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue(yaml.dump(config));

    // First call should read from file
    const result1 = readGlobalConfig();
    // Second call should use cache
    const result2 = readGlobalConfig();

    expect(fs.existsSync).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result1).toEqual(config);
    expect(result2).toEqual(config);
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

    expect(fs.existsSync).toHaveBeenCalledTimes(2);
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual({});
  });
});

describe('writeGlobalConfigPartial', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearGlobalConfigCache();
  });

  it('updates cache when writing partial config', () => {
    const initialConfig = {
      account: { email: 'test@example.com' },
    };
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue(yaml.dump(initialConfig));

    // Read initial config to populate cache
    readGlobalConfig();

    // Write partial update
    const key = faker.string.uuid();
    const partialUpdate = {
      account: { verifiedEmailKey: key },
    };
    writeGlobalConfigPartial(partialUpdate);

    // Read again - should use updated cache
    const result = readGlobalConfig();
    expect(fs.readFileSync).toHaveBeenCalledTimes(1); // Should not read file again
    expect(result).toEqual({
      account: {
        email: 'test@example.com',
        verifiedEmailKey: key,
      },
    });
  });

  it('merges top-level keys into existing config', () => {
    // Set up initial config
    const cloudApiKey = faker.string.uuid();
    const initialConfig = {
      account: { email: 'test@example.com' },
      cloud: { apiKey: cloudApiKey },
    };
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue(yaml.dump(initialConfig));

    // Write partial update
    const verifiedEmailKey = faker.string.uuid();
    const partialUpdate = {
      account: { verifiedEmailKey },
      hasHarmfulRedteamConsent: true,
    };
    writeGlobalConfigPartial(partialUpdate);

    // First call is for creating the file, second is for updating it.
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    const writtenConfig = yaml.load(jest.mocked(fs.writeFileSync).mock.calls[0][1] as string);
    expect(writtenConfig).toEqual({
      account: {
        email: 'test@example.com',
        verifiedEmailKey,
      },
      cloud: {
        apiKey: cloudApiKey,
      },
      hasHarmfulRedteamConsent: true,
    });
  });

  it('ignores undefined values', () => {
    // Set up initial config
    const cloudApiKey = faker.string.uuid();
    const initialConfig = {
      account: { email: 'test@example.com' },
      cloud: { apiKey: cloudApiKey },
    };
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue(yaml.dump(initialConfig));

    const partialUpdate: Partial<GlobalConfig> = {
      account: { email: undefined },
      cloud: undefined,
    };
    writeGlobalConfigPartial(partialUpdate);

    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    const writtenConfig = yaml.load(jest.mocked(fs.writeFileSync).mock.calls[0][1] as string);
    expect(writtenConfig).toEqual({
      account: {
        email: 'test@example.com',
      },
      cloud: {
        apiKey: cloudApiKey,
      },
    });
  });

  it('handles empty partial update', () => {
    // Set up initial config
    const initialConfig = {
      account: { email: 'test@example.com' },
    };

    // Set up mocks before any operations
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue(yaml.dump(initialConfig));

    // Read initial config to populate cache
    readGlobalConfig();

    // Perform the empty partial update
    writeGlobalConfigPartial({});

    // Verify the result
    const writtenConfig = yaml.load(jest.mocked(fs.writeFileSync).mock.calls[0][1] as string);
    expect(writtenConfig).toEqual(initialConfig);
  });
});
