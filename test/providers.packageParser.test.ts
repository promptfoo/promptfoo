import fs from 'fs';
import path from 'path';
import { importModule } from '../src/esm';
import { parsePackageProvider } from '../src/providers/packageParser';
import type { ProviderOptions } from '../src/types/providers';

jest.mock('fs');
jest.mock('../src/esm', () => ({
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
jest.mock('../src/logger');

describe('parsePackageProvider', () => {
  const mockBasePath = '/mock/base/path';
  const mockPackageName = 'testpackage';
  const mockProviderName = 'Provider';
  const mockProviderPath = `package:${mockPackageName}:${mockProviderName}`;
  const mockOptions: ProviderOptions = { config: {} };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully parse a valid package provider', async () => {
    const mockPackageJson = {
      name: mockPackageName,
      main: 'index.js',
    };
    const mockProvider = class {
      options: any;
      constructor(options: any) {
        this.options = options;
      }
    };

    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockPackageJson));
    jest.mocked(importModule).mockResolvedValue({ Provider: mockProvider });

    const result = await parsePackageProvider(mockProviderPath, mockBasePath, mockOptions);

    expect(result).toBeInstanceOf(mockProvider);
    expect(fs.existsSync).toHaveBeenCalledWith(
      path.join(mockBasePath, 'node_modules', mockPackageName, 'package.json'),
    );
    expect(importModule).toHaveBeenCalledWith(
      path.join(mockBasePath, 'node_modules', mockPackageName, 'index.js'),
    );
  });

  it('should throw an error for invalid provider format', async () => {
    await expect(parsePackageProvider('invalid:format', mockBasePath, mockOptions)).rejects.toThrow(
      'Invalid package provider format: invalid:format. Expected format: package:packageName:providerName',
    );
  });

  it('should throw an error if package is not found', async () => {
    jest.mocked(fs.existsSync).mockReturnValue(false);

    await expect(parsePackageProvider(mockProviderPath, mockBasePath, mockOptions)).rejects.toThrow(
      `Package not found: ${mockPackageName}. Make sure it's installed in ${mockBasePath}`,
    );
  });

  it('should throw an error if package.json cannot be parsed', async () => {
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue('invalid json');

    await expect(parsePackageProvider(mockProviderPath, mockBasePath, mockOptions)).rejects.toThrow(
      /Unexpected token/,
    );
  });

  it('should handle nested provider names', async () => {
    const mockPackageJson = {
      name: mockPackageName,
      main: 'index.js',
    };
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

    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockPackageJson));
    jest.mocked(importModule).mockResolvedValue(mockModule);

    const result = await parsePackageProvider(
      `package:${mockPackageName}:nested.Provider`,
      mockBasePath,
      mockOptions,
    );

    expect(result).toBeInstanceOf(mockModule.nested.Provider);
  });

  it('should pass options to the provider constructor', async () => {
    const mockPackageJson = {
      name: mockPackageName,
      main: 'index.js',
    };
    const MockProvider = jest.fn();

    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockPackageJson));
    jest.mocked(importModule).mockResolvedValue({ Provider: MockProvider });

    await parsePackageProvider(mockProviderPath, mockBasePath, mockOptions);

    expect(MockProvider).toHaveBeenCalledWith(mockOptions);
  });
});
