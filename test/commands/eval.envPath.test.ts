import fs from 'fs';
import { globSync } from 'glob';
import * as path from 'path';
import yaml from 'js-yaml';
import { doEval } from '../../src/commands/eval';
import { setupEnv } from '../../src/util';
// Removed CommandLineOptions import to avoid type conflicts

jest.mock('../../src/cache');
jest.mock('../../src/evaluator');
jest.mock('../../src/globalConfig/accounts');
jest.mock('../../src/migrate');
jest.mock('../../src/providers');
jest.mock('../../src/share');
jest.mock('../../src/table');
jest.mock('../../src/util/config/load');
jest.mock('../../src/util', () => ({
  setupEnv: jest.fn(),
}));
jest.mock('fs');
jest.mock('glob');
jest.mock('js-yaml');

const mockSetupEnv = setupEnv as jest.MockedFunction<typeof setupEnv>;
const mockFs = fs as jest.Mocked<typeof fs>;
const mockGlobSync = globSync as jest.MockedFunction<typeof globSync>;
const mockYaml = yaml as jest.Mocked<typeof yaml>;

// Mock resolveConfigs to return minimal data
const mockResolveConfigs = jest.fn().mockResolvedValue({
  config: {},
  testSuite: { tests: [], scenarios: [] },
  basePath: '/test',
});

// Import after mocking
jest.doMock('../../src/util/config/load', () => ({
  resolveConfigs: mockResolveConfigs,
}));

describe('eval envPath configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock process.cwd() to return consistent path
    jest.spyOn(process, 'cwd').mockReturnValue('/test');

    // Mock path.resolve to return predictable paths
    jest.spyOn(path, 'resolve').mockImplementation((base, relative) => `/test/${relative}`);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('CLI envPath precedence', () => {
    it('should use CLI envPath when provided', async () => {
      const cmdObj = {
        envPath: '/cli/env/path/.env',
        config: ['config.yaml'],
      };

      mockGlobSync.mockReturnValue(['/test/config.yaml']);
      mockFs.readFileSync.mockReturnValue('commandLineOptions:\n  envPath: /config/env/path/.env');
      mockYaml.load.mockReturnValue({
        commandLineOptions: {
          envPath: '/config/env/path/.env',
        },
      });

      try {
        await doEval(cmdObj, {}, undefined, {});
      } catch {
        // Expected to fail due to mocked dependencies, we're just testing the envPath logic
      }

      // Should use CLI envPath, not config envPath
      expect(mockSetupEnv).toHaveBeenCalledWith('/cli/env/path/.env');
    });
  });

  describe('Config-based envPath', () => {
    it('should extract envPath from config when no CLI envPath provided', async () => {
      const cmdObj = {
        config: ['config.yaml'],
      };

      mockGlobSync.mockReturnValue(['/test/config.yaml']);
      mockFs.readFileSync.mockReturnValue('commandLineOptions:\n  envPath: /config/env/path/.env');
      mockYaml.load.mockReturnValue({
        commandLineOptions: {
          envPath: '/config/env/path/.env',
        },
      });

      try {
        await doEval(cmdObj, {}, undefined, {});
      } catch {
        // Expected to fail due to mocked dependencies
      }

      expect(mockSetupEnv).toHaveBeenCalledWith('/config/env/path/.env');
    });

    it('should handle multiple config files and use first envPath found', async () => {
      const cmdObj = {
        config: ['config1.yaml', 'config2.yaml'],
      };

      mockGlobSync
        .mockReturnValueOnce(['/test/config1.yaml']) // First config path
        .mockReturnValueOnce(['/test/config2.yaml']); // Second config path
      mockFs.readFileSync
        .mockReturnValueOnce('# no envPath in first config')
        .mockReturnValueOnce('commandLineOptions:\n  envPath: /config2/env/path/.env');

      mockYaml.load
        .mockReturnValueOnce({}) // First config has no commandLineOptions
        .mockReturnValueOnce({
          commandLineOptions: {
            envPath: '/config2/env/path/.env',
          },
        });

      try {
        await doEval(cmdObj, {}, undefined, {});
      } catch {
        // Expected to fail due to mocked dependencies
      }

      expect(mockSetupEnv).toHaveBeenCalledWith('/config2/env/path/.env');
    });

    it('should handle config file not existing gracefully', async () => {
      const cmdObj = {
        config: ['nonexistent.yaml'],
      };

      mockGlobSync.mockReturnValue([]); // No files found

      try {
        await doEval(cmdObj, {}, undefined, {});
      } catch {
        // Expected to fail due to mocked dependencies
      }

      // Should call setupEnv with undefined since no envPath found
      expect(mockSetupEnv).toHaveBeenCalledWith(undefined);
      expect(mockFs.readFileSync).not.toHaveBeenCalled();
    });

    it('should handle malformed config file gracefully', async () => {
      const cmdObj = {
        config: ['malformed.yaml'],
      };

      mockGlobSync.mockReturnValue(['/test/malformed.yaml']);
      mockFs.readFileSync.mockReturnValue('invalid: yaml: content:');
      mockYaml.load.mockImplementation(() => {
        throw new Error('Invalid YAML');
      });

      try {
        await doEval(cmdObj, {}, undefined, {});
      } catch {
        // Expected to fail due to mocked dependencies
      }

      // Should call setupEnv with undefined due to parsing error
      expect(mockSetupEnv).toHaveBeenCalledWith(undefined);
    });

    it('should handle config with no commandLineOptions section', async () => {
      const cmdObj = {
        config: ['config.yaml'],
      };

      mockGlobSync.mockReturnValue(['/test/config.yaml']);
      mockFs.readFileSync.mockReturnValue('prompts:\n  - "test prompt"');
      mockYaml.load.mockReturnValue({
        prompts: ['test prompt'],
      });

      try {
        await doEval(cmdObj, {}, undefined, {});
      } catch {
        // Expected to fail due to mocked dependencies
      }

      // Should call setupEnv with undefined since no commandLineOptions.envPath
      expect(mockSetupEnv).toHaveBeenCalledWith(undefined);
    });

    it('should handle array config paths', async () => {
      const cmdObj = {
        config: ['config1.yaml', 'config2.yaml'],
      };

      mockGlobSync
        .mockReturnValueOnce(['/test/config1.yaml']) // First config path
        .mockReturnValueOnce(['/test/config2.yaml']); // Second config path (not reached)
      mockFs.readFileSync
        .mockReturnValueOnce('commandLineOptions:\n  envPath: /first/env/.env')
        .mockReturnValueOnce('commandLineOptions:\n  envPath: /second/env/.env');

      mockYaml.load
        .mockReturnValueOnce({
          commandLineOptions: { envPath: '/first/env/.env' },
        })
        .mockReturnValueOnce({
          commandLineOptions: { envPath: '/second/env/.env' },
        });

      try {
        await doEval(cmdObj, {}, undefined, {});
      } catch {
        // Expected to fail due to mocked dependencies
      }

      // Should use first found envPath
      expect(mockSetupEnv).toHaveBeenCalledWith('/first/env/.env');
    });
  });

  describe('No config scenario', () => {
    it('should handle no config files provided', async () => {
      const cmdObj = {};

      try {
        await doEval(cmdObj, {}, undefined, {});
      } catch {
        // Expected to fail due to mocked dependencies
      }

      // Should call setupEnv with undefined
      expect(mockSetupEnv).toHaveBeenCalledWith(undefined);
      expect(mockFs.existsSync).not.toHaveBeenCalled();
    });
  });
});
