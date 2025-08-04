import * as fs from 'fs';

import yaml from 'js-yaml';

import type {
  readGlobalConfig,
  writeGlobalConfig,
  writeGlobalConfigPartial,
} from '../src/globalConfig/globalConfig';

// Helper function to validate UUID format
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// Clear any existing mocks
jest.unmock('../src/globalConfig/globalConfig');

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  statSync: jest.fn(),
  readdirSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    access: jest.fn(),
    mkdir: jest.fn(),
  },
}));

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('../src/database');

describe('Global Config', () => {
  let globalConfig: {
    readGlobalConfig: typeof readGlobalConfig;
    writeGlobalConfig: typeof writeGlobalConfig;
    writeGlobalConfigPartial: typeof writeGlobalConfigPartial;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    await jest.isolateModules(async () => {
      globalConfig = await import('../src/globalConfig/globalConfig');
    });
  });

  const mockConfig = { id: 'test-id', account: { email: 'test@example.com' } };

  describe('readGlobalConfig', () => {
    describe('when config file exists', () => {
      beforeEach(() => {
        jest.mocked(fs.promises.access).mockImplementation(async (path) => {
          const pathStr = path.toString();
          if (!pathStr.includes('promptfoo.yaml') && !pathStr.includes('.promptfoo')) {
            throw new Error('File not found');
          }
        });
        jest.mocked(fs.promises.readFile).mockResolvedValue(yaml.dump(mockConfig) as any);
      });

      it('should read and parse the existing config file', async () => {
        const result = await globalConfig.readGlobalConfig();
        expect(fs.promises.readFile).toHaveBeenCalledWith(
          expect.stringContaining('promptfoo.yaml'),
          'utf-8',
        );
        expect(result).toEqual(mockConfig);
      });

      it('should handle empty config file by returning config with generated ID', async () => {
        jest.mocked(fs.promises.readFile).mockResolvedValue('' as any);

        const result = await globalConfig.readGlobalConfig();

        expect(result).toEqual({ id: expect.any(String) });
        expect(result.id).toBeDefined();
        expect(typeof result.id).toBe('string');
        expect(isValidUUID(result.id!)).toBe(true);
      });

      it('should generate and save ID when existing config lacks an ID', async () => {
        const configWithoutId = { account: { email: 'test@example.com' } };
        jest.mocked(fs.promises.readFile).mockResolvedValue(yaml.dump(configWithoutId) as any);
        jest.mocked(fs.promises.writeFile).mockImplementation();

        const result = await globalConfig.readGlobalConfig();

        expect(result.id).toBeDefined();
        expect(typeof result.id).toBe('string');
        expect(isValidUUID(result.id!)).toBe(true);
        expect(result.account).toEqual(configWithoutId.account);
        // Should have written the config with the new ID
        expect(fs.promises.writeFile).toHaveBeenCalledWith(
          expect.stringContaining('promptfoo.yaml'),
          expect.stringContaining(`id: ${result.id}`),
        );
      });
    });

    describe('when config file does not exist', () => {
      beforeEach(() => {
        jest.mocked(fs.promises.access).mockRejectedValue(new Error('File not found'));
        jest.mocked(fs.promises.writeFile).mockImplementation();
        jest.mocked(fs.promises.mkdir).mockImplementation();
      });

      it('should create new config directory and file with generated UUID', async () => {
        const result = await globalConfig.readGlobalConfig();

        expect(fs.promises.access).toHaveBeenCalledTimes(2);
        expect(fs.promises.mkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
        expect(fs.promises.writeFile).toHaveBeenCalledTimes(1);
        expect(fs.promises.writeFile).toHaveBeenCalledWith(
          expect.stringContaining('promptfoo.yaml'),
          expect.any(String),
        );
        expect(result).toEqual({ id: expect.any(String) });
        expect(result.id).toBeDefined();
        expect(typeof result.id).toBe('string');
        expect(isValidUUID(result.id!)).toBe(true);
      });
    });

    describe('error handling', () => {
      it('should throw error if config file is invalid YAML', async () => {
        jest.mocked(fs.promises.access).mockResolvedValue(undefined);
        jest.mocked(fs.promises.readFile).mockResolvedValue('invalid: yaml: content:' as any);

        await expect(globalConfig.readGlobalConfig()).rejects.toThrow(/bad indentation of a mapping entry/);
      });
    });
  });

  describe('writeGlobalConfig', () => {
    it('should write config to file in YAML format', async () => {
      await globalConfig.writeGlobalConfig({
        ...mockConfig,
      });

      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('promptfoo.yaml'),
        expect.stringContaining('account:'),
      );
    });
  });

  describe('writeGlobalConfigPartial', () => {
    beforeEach(() => {
      // Setup initial config
      jest.mocked(fs.promises.access).mockResolvedValue(undefined);
      jest.mocked(fs.promises.readFile).mockResolvedValue(
        yaml.dump({
          account: { email: 'old@example.com' },
          cloud: { apiKey: 'old-key', apiHost: 'old-host' },
        }) as any,
      );
    });

    it('should merge new config with existing config', async () => {
      const partialConfig = {
        account: { email: 'new@example.com' },
      };

      await globalConfig.writeGlobalConfigPartial(partialConfig);

      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('promptfoo.yaml'),
        expect.stringMatching(/email: new@example\.com.*apiKey: old-key/s),
      );
    });

    it('should remove keys when value is falsy', async () => {
      const partialConfig = {
        cloud: undefined,
      };

      await globalConfig.writeGlobalConfigPartial(partialConfig);

      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('promptfoo.yaml'),
        expect.not.stringContaining('apiKey: old-key'),
      );
    });

    it('should update specific keys while preserving others', async () => {
      const partialConfig = {
        cloud: { apiKey: 'new-key' },
      };

      await globalConfig.writeGlobalConfigPartial(partialConfig);

      const writeCall = jest.mocked(fs.promises.writeFile).mock.calls[1][1] as string;
      const writtenConfig = yaml.load(writeCall) as any;

      expect(writtenConfig.cloud.apiKey).toBe('new-key');
      expect(writtenConfig.account.email).toBe('old@example.com');
    });
  });
});
