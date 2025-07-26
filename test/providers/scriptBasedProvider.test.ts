import { createScriptBasedProviderFactory } from '../../src/providers/scriptBasedProvider';
import { getResolvedRelativePath } from '../../src/util/file';

import type { LoadApiProviderContext } from '../../src/types';
import type { ProviderOptions } from '../../src/types/providers';

// Mock the getResolvedRelativePath function
jest.mock('../../src/util/file', () => ({
  getResolvedRelativePath: jest.fn((scriptPath, basePath, isCloudConfig) => {
    // For testing, just append '/resolved' to the path
    return `${scriptPath}/resolved`;
  }),
}));

// Create a mock provider constructor
class MockProvider {
  scriptPath: string;
  options: ProviderOptions;

  constructor(scriptPath: string, options: ProviderOptions) {
    this.scriptPath = scriptPath;
    this.options = options;
  }

  id() {
    return 'mock-provider';
  }
}

describe('scriptBasedProvider', () => {
  describe('createScriptBasedProviderFactory', () => {
    const mockProviderOptions: ProviderOptions = {
      id: 'mock',
      config: {},
    };

    const mockContext: LoadApiProviderContext = {
      basePath: '/base/path',
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should create a factory that tests for prefix pattern', () => {
      const factory = createScriptBasedProviderFactory('test', null, MockProvider as any);

      expect(factory.test('test:script.js')).toBe(true);
      expect(factory.test('other:script.js')).toBe(false);
    });

    it('should create a factory that tests for file extension pattern', () => {
      const factory = createScriptBasedProviderFactory('test', 'js', MockProvider as any);

      expect(factory.test('test:script.js')).toBe(true);
      expect(factory.test('file://path/script.js')).toBe(true);
      expect(factory.test('file://path/script.js:function')).toBe(true);
      expect(factory.test('file://path/script.py')).toBe(false);
    });

    it('should extract script path correctly when using prefix pattern', async () => {
      const factory = createScriptBasedProviderFactory('test', null, MockProvider as any);
      const provider = await factory.create('test:script.js', mockProviderOptions, mockContext);

      expect(getResolvedRelativePath).toHaveBeenCalledWith('script.js', false);
      expect((provider as any).scriptPath).toBe('script.js/resolved');
    });

    it('should extract script path correctly when using file:// pattern', async () => {
      const factory = createScriptBasedProviderFactory('test', 'js', MockProvider as any);
      const provider = await factory.create(
        'file://path/script.js',
        mockProviderOptions,
        mockContext,
      );

      expect(getResolvedRelativePath).toHaveBeenCalledWith('path/script.js', false);
      expect((provider as any).scriptPath).toBe('path/script.js/resolved');
    });

    it('should handle cloud config correctly', async () => {
      const cloudOptions: ProviderOptions = {
        id: 'mock',
        config: { isCloudConfig: true },
      };

      const factory = createScriptBasedProviderFactory('test', null, MockProvider as any);
      await factory.create('test:script.js', cloudOptions, mockContext);

      expect(getResolvedRelativePath).toHaveBeenCalledWith('script.js', true);
    });
  });
});
