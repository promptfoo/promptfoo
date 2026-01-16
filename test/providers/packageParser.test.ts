import path from 'path';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importModule, resolvePackageEntryPoint } from '../../src/esm';
import {
  isPackagePath,
  loadFromPackage,
  parsePackageProvider,
} from '../../src/providers/packageParser';

import type { ProviderOptions } from '../../src/types/providers';

vi.mock('../../src/esm', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    importModule: vi.fn(async (_modulePath: string, functionName?: string) => {
      const mockModule = {
        default: vi.fn((data) => data.defaultField),
        parseResponse: vi.fn((data) => data.specificField),
      };
      if (functionName) {
        return mockModule[functionName as keyof typeof mockModule];
      }
      return mockModule;
    }),
    resolvePackageEntryPoint: vi.fn(),
  };
});

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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully parse a valid package', async () => {
    const mockFunction = vi.fn();

    const mockPackagePath = path.join(mockBasePath, 'node_modules', mockPackageName, 'index.js');
    vi.mocked(resolvePackageEntryPoint).mockReturnValue(mockPackagePath);
    vi.mocked(importModule).mockResolvedValue({ getVariable: mockFunction });

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
    vi.mocked(resolvePackageEntryPoint).mockReturnValue(null);

    await expect(loadFromPackage(mockProviderPath, mockBasePath)).rejects.toThrow(
      `Package not found: ${mockPackageName}. Make sure it's installed in ${mockBasePath}`,
    );
  });

  it('should handle nested provider names', async () => {
    const mockModule = {
      nested: {
        getVariable: vi.fn(),
      },
    };

    const mockPackagePath = path.join(mockBasePath, 'node_modules', mockPackageName, 'index.js');
    vi.mocked(resolvePackageEntryPoint).mockReturnValue(mockPackagePath);
    vi.mocked(importModule).mockResolvedValue(mockModule);

    const result = await loadFromPackage(
      `package:${mockPackageName}:nested.getVariable`,
      mockBasePath,
    );

    expect(result).toBe(mockModule.nested.getVariable);
    result('test input');
    expect(mockModule.nested.getVariable).toHaveBeenCalledWith('test input');
  });

  it('should throw an error if entity is not found in module', async () => {
    const mockPackagePath = path.join(mockBasePath, 'node_modules', mockPackageName, 'index.js');
    vi.mocked(resolvePackageEntryPoint).mockReturnValue(mockPackagePath);
    vi.mocked(importModule).mockResolvedValue({ someOtherExport: vi.fn() });

    await expect(loadFromPackage(mockProviderPath, mockBasePath)).rejects.toThrow(
      `Could not find entity: ${mockFunctionName} in module: ${mockPackagePath}`,
    );
  });
});

describe('parsePackageProvider', () => {
  const mockBasePath = '/mock/base/path';
  const mockPackageName = 'testpackage';
  const mockProviderName = 'Provider';
  const mockProviderPath = `package:${mockPackageName}:${mockProviderName}`;
  const mockOptions: ProviderOptions = { config: {} };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully parse a valid package provider', async () => {
    const mockProvider = class {
      options: any;
      constructor(options: any) {
        this.options = options;
      }
    };

    const mockPackagePath = path.join(mockBasePath, 'node_modules', mockPackageName, 'index.js');
    vi.mocked(resolvePackageEntryPoint).mockReturnValue(mockPackagePath);
    vi.mocked(importModule).mockResolvedValue({ Provider: mockProvider });

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
    vi.mocked(resolvePackageEntryPoint).mockReturnValue(null);

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
    vi.mocked(resolvePackageEntryPoint).mockReturnValue(mockPackagePath);
    vi.mocked(importModule).mockResolvedValue(mockModule);

    const result = await parsePackageProvider(
      `package:${mockPackageName}:nested.Provider`,
      mockBasePath,
      mockOptions,
    );

    expect(result).toBeInstanceOf(mockModule.nested.Provider);
  });

  it('should pass options to the provider constructor', async () => {
    const MockProvider = vi.fn();

    const mockPackagePath = path.join(mockBasePath, 'node_modules', mockPackageName, 'index.js');
    vi.mocked(resolvePackageEntryPoint).mockReturnValue(mockPackagePath);
    vi.mocked(importModule).mockResolvedValue({ Provider: MockProvider });

    await parsePackageProvider(mockProviderPath, mockBasePath, mockOptions);

    expect(MockProvider).toHaveBeenCalledWith(mockOptions);
  });
});
