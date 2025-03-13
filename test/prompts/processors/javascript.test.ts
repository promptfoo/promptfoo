import { importModule } from '../../../src/esm';
import { processJsFile, transformContext } from '../../../src/prompts/processors/javascript';
import invariant from '../../../src/util/invariant';

jest.mock('../../../src/esm', () => ({
  importModule: jest.fn(),
}));

describe('transformContext', () => {
  it('should transform context with provider and config', () => {
    const context = {
      vars: { key: 'value' },
      provider: { id: () => 'providerId', label: 'providerLabel', callApi: jest.fn() },
      config: { configKey: 'configValue' },
    };
    const result = transformContext(context);
    expect(result).toEqual({
      vars: { key: 'value' },
      provider: { id: 'providerId', label: 'providerLabel' },
      config: { configKey: 'configValue' },
    });
  });

  it('should transform context with provider and empty config', () => {
    const context = {
      vars: { key: 'value' },
      provider: { id: () => 'providerId', label: 'providerLabel', callApi: jest.fn() },
    };
    const result = transformContext(context);
    expect(result).toEqual({
      vars: { key: 'value' },
      provider: { id: 'providerId', label: 'providerLabel' },
      config: {},
    });
  });

  it('should throw an error if provider is missing', () => {
    const context = { vars: { key: 'value' } };
    expect(() => transformContext(context)).toThrow('Provider is required');
  });
});

describe('processJsFile', () => {
  const mockImportModule = jest.mocked(importModule);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process a valid JavaScript file without a function name or a label', async () => {
    const filePath = 'file.js';
    const mockFunction = jest.fn(() => 'dummy prompt');
    mockImportModule.mockResolvedValue(mockFunction);
    await expect(processJsFile(filePath, {}, undefined)).resolves.toEqual([
      {
        raw: String(mockFunction),
        label: 'file.js',
        function: expect.any(Function),
        config: {},
      },
    ]);
    expect(mockImportModule).toHaveBeenCalledWith(filePath, undefined);
  });

  it('should process a valid JavaScript file with a label without a function name', async () => {
    const filePath = 'file.js';
    const mockFunction = jest.fn(() => 'dummy prompt');
    mockImportModule.mockResolvedValue(mockFunction);
    await expect(processJsFile(filePath, { label: 'myLabel' }, undefined)).resolves.toEqual([
      {
        raw: String(mockFunction),
        label: 'myLabel',
        function: expect.any(Function),
        config: {},
      },
    ]);
    expect(mockImportModule).toHaveBeenCalledWith(filePath, undefined);
  });

  it('should process a valid JavaScript file with a function name without a label', async () => {
    const filePath = 'file.js';
    const functionName = 'myFunction';
    const mockFunction = () => 'dummy prompt';
    mockImportModule.mockResolvedValue(mockFunction);
    await expect(processJsFile(filePath, {}, functionName)).resolves.toEqual([
      {
        raw: String(mockFunction),
        label: 'file.js:myFunction',
        function: expect.any(Function),
        config: {},
      },
    ]);
    expect(mockImportModule).toHaveBeenCalledWith(filePath, functionName);
  });

  it('should process a valid JavaScript file with a label and a function name', async () => {
    const filePath = 'file.js';
    const functionName = 'myFunction';
    const mockFunction = jest.fn(() => 'dummy prompt');
    mockImportModule.mockResolvedValue(mockFunction);
    await expect(processJsFile(filePath, { label: 'myLabel' }, functionName)).resolves.toEqual([
      {
        raw: String(mockFunction),
        label: 'myLabel',
        function: expect.any(Function),
        config: {},
      },
    ]);
    expect(mockImportModule).toHaveBeenCalledWith(filePath, functionName);
  });

  it('should throw an error if the file cannot be imported', async () => {
    const filePath = 'nonexistent.js';
    mockImportModule.mockImplementation(() => {
      throw new Error('File not found');
    });

    await expect(processJsFile(filePath, {}, undefined)).rejects.toThrow('File not found');
    expect(mockImportModule).toHaveBeenCalledWith(filePath, undefined);
  });

  it('should process a valid JavaScript file with config', async () => {
    const filePath = 'file.js';
    const mockFunction = jest.fn(() => 'dummy prompt');
    mockImportModule.mockResolvedValue(mockFunction);
    const config = { key: 'value' };
    await expect(processJsFile(filePath, { config }, undefined)).resolves.toEqual([
      {
        raw: String(mockFunction),
        label: 'file.js',
        function: expect.any(Function),
        config: { key: 'value' },
      },
    ]);
    expect(mockImportModule).toHaveBeenCalledWith(filePath, undefined);
  });

  it('should pass config to the prompt function', async () => {
    const filePath = 'file.js';
    const mockFunction = jest.fn(() => 'dummy prompt');
    mockImportModule.mockResolvedValue(mockFunction);
    const config = { key: 'value' };
    const result = await processJsFile(filePath, { config }, undefined);
    const promptFunction = result[0].function;
    invariant(promptFunction, 'Prompt function is required');
    await promptFunction({
      vars: {},
      provider: { id: () => 'test', label: 'Test', callApi: jest.fn() },
    });
    expect(mockFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        config: { key: 'value' },
      }),
    );
  });
});
