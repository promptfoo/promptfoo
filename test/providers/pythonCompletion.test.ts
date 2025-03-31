import { getCache, isCacheEnabled } from '../../src/cache';
import { PythonProvider } from '../../src/providers/pythonCompletion';

// Create direct mocks for the functions we need to test
const mockRunPython = jest.fn();
const mockReadFileSync = jest.fn();
const mockExtname = jest.fn();
const mockResolve = jest.fn();

// Setup our mocks
jest.mock('../../src/python/pythonUtils', () => ({
  runPython: (...args: any[]) => mockRunPython(...args),
}));

jest.mock('../../src/cache', () => ({
  getCache: jest.fn(),
  isCacheEnabled: jest.fn(),
}));

jest.mock('fs', () => ({
  readFileSync: (...args: any[]) => mockReadFileSync(...args),
}));

jest.mock('path', () => ({
  resolve: (...args: any[]) => mockResolve(...args),
  relative: jest.fn().mockReturnValue('relative/path'),
  extname: (...args: any[]) => mockExtname(...args),
  join: jest.fn((...args) => args.join('/')),
}));

jest.mock('../../src/esm', () => ({
  importModule: jest.fn().mockImplementation(() => Promise.resolve({ temperature: 0.6 })),
}));

jest.mock('../../src/util', () => ({
  ...jest.requireActual('../../src/util'),
  parsePathOrGlob: jest.fn((basePath, runPath) => {
    // Handle the special case for testing function names
    if (runPath === 'script.py:custom_function') {
      return {
        filePath: 'script.py',
        functionName: 'custom_function',
        isPathPattern: false,
        extension: '.py',
      };
    }

    // Default case
    return {
      filePath: runPath,
      functionName: undefined,
      isPathPattern: false,
      extension: '.py',
    };
  }),
}));

// Extend the PythonProviderConfig for testing
interface TestPythonProviderConfig {
  pythonExecutable?: string;
  settings?: any;
  templates?: any[];
  [key: string]: any;
}

describe('PythonProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock getCache and isCacheEnabled
    jest.mocked(getCache).mockResolvedValue({
      get: jest.fn(),
      set: jest.fn(),
    } as never);
    jest.mocked(isCacheEnabled).mockReturnValue(false);

    // Setup mockResolve to return a predictable path
    mockResolve.mockImplementation((base, file) => `/resolved/${file}`);

    // Default mock for readFileSync
    mockReadFileSync.mockReturnValue('mock file content');
  });

  describe('file reference configuration', () => {
    beforeEach(() => {
      // Setup mockExtname to return extensions based on file path
      mockExtname.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return '.json';
        }
        if (filePath.includes('config.yaml') || filePath.includes('config.yml')) {
          return '.yaml';
        }
        if (filePath.includes('prompt.txt')) {
          return '.txt';
        }
        return '.py'; // Default to Python for other files
      });

      // Setup mockReadFileSync to return content based on file path
      mockReadFileSync.mockImplementation((filePath: string) => {
        if (String(filePath).includes('config.json')) {
          return '{"modelSettings": {"temperature": 0.7}}';
        }
        if (String(filePath).includes('config.yaml') || String(filePath).includes('config.yml')) {
          return 'modelSettings:\n  temperature: 0.8';
        }
        if (String(filePath).includes('prompt.txt')) {
          return 'This is a custom prompt template';
        }
        return 'mock file content';
      });

      // Setup mockRunPython for Python config files
      mockRunPython.mockImplementation((filePath, functionName, args) => {
        if (String(filePath).includes('config.py')) {
          return Promise.resolve({ temperature: 0.9 });
        }
        return Promise.resolve({ output: 'test output' });
      });
    });

    it('should load JSON file references in config', async () => {
      const provider = new PythonProvider('script.py', {
        id: 'testId',
        config: {
          basePath: '/base',
          settings: 'file://config.json',
        },
      });

      // Cast config to our test interface to access the properties
      const config = provider.config as TestPythonProviderConfig;

      // Explicitly process file references
      await provider.processConfigReferences();

      expect(mockReadFileSync).toHaveBeenCalledWith(
        expect.stringContaining('config.json'),
        expect.any(String),
      );
      expect(config.settings).toEqual({ modelSettings: { temperature: 0.7 } });
    });

    it('should load YAML file references in config', async () => {
      const provider = new PythonProvider('script.py', {
        id: 'testId',
        config: {
          basePath: '/base',
          settings: 'file://config.yaml',
        },
      });

      // Cast config to our test interface to access the properties
      const config = provider.config as TestPythonProviderConfig;

      // Explicitly process file references
      await provider.processConfigReferences();

      expect(mockReadFileSync).toHaveBeenCalledWith(
        expect.stringContaining('config.yaml'),
        expect.any(String),
      );
      expect(config.settings).toEqual({ modelSettings: { temperature: 0.8 } });
    });

    it('should load Python file references with function name in config', async () => {
      const provider = new PythonProvider('script.py', {
        id: 'testId',
        config: {
          basePath: '/base',
          settings: 'file://config.py:get_settings',
        },
      });

      // Cast config to our test interface to access the properties
      const config = provider.config as TestPythonProviderConfig;

      // Explicitly process file references
      await provider.processConfigReferences();

      expect(mockRunPython).toHaveBeenCalledWith(
        expect.stringContaining('config.py'),
        'get_settings',
        [],
      );
      expect(config.settings).toEqual({ temperature: 0.9 });
    });

    it('should handle nested file references in config', async () => {
      // Reset the mocks to track specific calls
      mockReadFileSync.mockClear();

      // Mock implementation for nested references
      mockReadFileSync.mockImplementation((filePath: string) => {
        if (String(filePath).includes('prompt.txt')) {
          return 'This is a custom prompt template';
        }
        if (String(filePath).includes('config.json')) {
          return '{"modelSettings": {"temperature": 0.7}}';
        }
        return '';
      });

      const provider = new PythonProvider('script.py', {
        id: 'testId',
        config: {
          basePath: '/base',
          settings: {
            model: 'gpt-4',
            promptTemplate: 'file://prompt.txt',
            advanced: 'file://config.json',
          },
        },
      });

      // Cast config to our test interface to access the properties
      const config = provider.config as TestPythonProviderConfig;

      // Explicitly process file references
      await provider.processConfigReferences();

      // Verify mockReadFileSync was called for both files
      expect(mockReadFileSync).toHaveBeenCalledTimes(2);
      expect(config.settings).toEqual({
        model: 'gpt-4',
        promptTemplate: 'This is a custom prompt template',
        advanced: { modelSettings: { temperature: 0.7 } },
      });
    });

    it('should handle file references in arrays', async () => {
      const provider = new PythonProvider('script.py', {
        id: 'testId',
        config: {
          basePath: '/base',
          templates: ['file://prompt.txt', 'static template'],
        },
      });

      // Cast config to our test interface to access the properties
      const config = provider.config as TestPythonProviderConfig;

      // Explicitly process file references
      await provider.processConfigReferences();

      expect(mockReadFileSync).toHaveBeenCalledWith(
        expect.stringContaining('prompt.txt'),
        expect.any(String),
      );
      expect(config.templates).toEqual(['This is a custom prompt template', 'static template']);
    });

    it('should gracefully handle errors in file loading', async () => {
      // Mock readFileSync to throw an error
      mockReadFileSync.mockImplementationOnce(() => {
        throw new Error('File not found');
      });

      const provider = new PythonProvider('script.py', {
        id: 'testId',
        config: {
          basePath: '/base',
          settings: 'file://missing-file.json',
        },
      });

      // Cast config to our test interface to access the properties
      const config = provider.config as TestPythonProviderConfig;

      // Explicitly process file references
      await provider.processConfigReferences();

      // The config should remain unchanged
      expect(config.settings).toBe('file://missing-file.json');
    });
  });
});
