import { createRequire } from 'node:module';
import path from 'path';
import { importModule } from '../../src/esm';
import {
  parsePackageProvider,
  loadFromPackage,
  isPackagePath,
} from '../../src/providers/packageParser';
import type { ProviderOptions } from '../../src/types/providers';

jest.mock('node:module', () => {
  return {
    createRequire: jest.fn(() => jest.fn((path: string) => path)),
  };
});
jest.mock('../../src/esm', () => ({
  importModule: jest.fn(async (modulePath: string, functionName?: string) => {
    const mockModule = {
      default: jest.fn((data) => data.defaultField),
      parseResponse: jest.fn((data) => data.specificField),
    };
    if (functionName) {
      return mockModule[functionName as keyof typeof mockModule];
    }
    return mockModule;
  }),
}));

describe('isPackagePath', () => {
  it('should return true for package paths', () => {
    expect(isPackagePath('package:packageName:exportedClassOrFunction')).toBe(true);
  });

  it('should return false for non-package paths', () => {
    expect(isPackagePath('notAPackagePath')).toBe(false);
  });
});

describe('loadFromPackage', () => {
  const mockBasePath = '/mock/base/path';
  const mockPackageName = 'testpackage';
  const mockFunctionName = 'getVariable';
  const mockProviderPath = `package:${mockPackageName}:${mockFunctionName}`;
  const mockRequire: NodeJS.Require = {
    resolve: jest.fn() as unknown as NodeJS.RequireResolve,
  } as unknown as NodeJS.Require;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully parse a valid package', async () => {
    const mockFunction = jest.fn();

    const mockPackagePath = path.join(mockBasePath, 'node_modules', mockPackageName, 'index.js');
    jest.mocked(mockRequire.resolve).mockReturnValue(mockPackagePath);
    jest.mocked(createRequire).mockReturnValue(mockRequire);
    jest.mocked(importModule).mockResolvedValue({ getVariable: mockFunction });

    const result = await loadFromPackage(mockProviderPath, mockBasePath);

    expect(result).toBe(mockFunction);
    result('test');
    expect(mockFunction).toHaveBeenCalledWith('test');
    expect(importModule).toHaveBeenCalledWith(mockPackagePath);
  });

  it('should throw an error for invalid provider format', async () => {
    await expect(loadFromPackage('invalid:format', mockBasePath)).rejects.toThrow(
      'Invalid package format: invalid:format. Expected format: package:packageName:exportedClassOrFunction',
    );
  });

  it('should throw an error if package is not found', async () => {
    jest.mocked(mockRequire.resolve).mockImplementationOnce(() => {
      throw new Error('Cannot find module');
    });
    jest.mocked(createRequire).mockReturnValue(mockRequire);

    await expect(loadFromPackage(mockProviderPath, mockBasePath)).rejects.toThrow(
      `Package not found: ${mockPackageName}. Make sure it's installed in ${mockBasePath}`,
    );
  });

  it('should handle nested provider names', async () => {
    const mockModule = {
      nested: {
        getVariable: jest.fn(),
      },
    };

    const mockPackagePath = path.join(mockBasePath, 'node_modules', mockPackageName, 'index.js');
    jest.mocked(mockRequire.resolve).mockReturnValue(mockPackagePath);
    jest.mocked(createRequire).mockReturnValue(mockRequire);
    jest.mocked(importModule).mockResolvedValue(mockModule);

    const result = await loadFromPackage(
      `package:${mockPackageName}:nested.getVariable`,
      mockBasePath,
    );

    expect(result).toBe(mockModule.nested.getVariable);
    result('test input');
    expect(mockModule.nested.getVariable).toHaveBeenCalledWith('test input');
  });
});

describe('parsePackageProvider', () => {
  const mockBasePath = '/mock/base/path';
  const mockPackageName = 'testpackage';
  const mockProviderName = 'Provider';
  const mockProviderPath = `package:${mockPackageName}:${mockProviderName}`;
  const mockOptions: ProviderOptions = { config: {} };
  const mockRequire: NodeJS.Require = {
    resolve: jest.fn() as unknown as NodeJS.RequireResolve,
  } as unknown as NodeJS.Require;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully parse a valid package provider', async () => {
    const mockProvider = class {
      options: any;
      constructor(options: any) {
        this.options = options;
      }
    };

    const mockPackagePath = path.join(mockBasePath, 'node_modules', mockPackageName, 'index.js');
    jest.mocked(mockRequire.resolve).mockReturnValue(mockPackagePath);
    jest.mocked(createRequire).mockReturnValue(mockRequire);
    jest.mocked(importModule).mockResolvedValue({ Provider: mockProvider });

    const result = await parsePackageProvider(mockProviderPath, mockBasePath, mockOptions);

    expect(result).toBeInstanceOf(mockProvider);
    expect(importModule).toHaveBeenCalledWith(mockPackagePath);
  });

  it('should throw an error for invalid provider format', async () => {
    await expect(parsePackageProvider('invalid:format', mockBasePath, mockOptions)).rejects.toThrow(
      'Invalid package format: invalid:format. Expected format: package:packageName:exportedClassOrFunction',
    );
  });

  it('should throw an error if package is not found', async () => {
    jest.mocked(mockRequire.resolve).mockImplementationOnce(() => {
      throw new Error('Cannot find module');
    });
    jest.mocked(createRequire).mockReturnValue(mockRequire);

    await expect(parsePackageProvider(mockProviderPath, mockBasePath, mockOptions)).rejects.toThrow(
      `Package not found: ${mockPackageName}. Make sure it's installed in ${mockBasePath}`,
    );
  });

  it('should handle nested provider names', async () => {
    const mockModule = {
      nested: {
        Provider: class {
          options: ProviderOptions;
          constructor(options: any) {
            this.options = options;
          }
        },
      },
    };

    const mockPackagePath = path.join(mockBasePath, 'node_modules', mockPackageName, 'index.js');
    jest.mocked(mockRequire.resolve).mockReturnValue(mockPackagePath);
    jest.mocked(createRequire).mockReturnValue(mockRequire);
    jest.mocked(importModule).mockResolvedValue(mockModule);

    const result = await parsePackageProvider(
      `package:${mockPackageName}:nested.Provider`,
      mockBasePath,
      mockOptions,
    );

    expect(result).toBeInstanceOf(mockModule.nested.Provider);
  });

  it('should pass options to the provider constructor', async () => {
    const MockProvider = jest.fn();

    const mockPackagePath = path.join(mockBasePath, 'node_modules', mockPackageName, 'index.js');
    jest.mocked(mockRequire.resolve).mockReturnValue(mockPackagePath);
    jest.mocked(createRequire).mockReturnValue(mockRequire);
    jest.mocked(importModule).mockResolvedValue({ Provider: MockProvider });

    await parsePackageProvider(mockProviderPath, mockBasePath, mockOptions);

    expect(MockProvider).toHaveBeenCalledWith(mockOptions);
  });
});
