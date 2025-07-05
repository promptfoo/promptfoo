import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../evalConfig';

describe('evalConfig store', () => {
  beforeEach(() => {
    // Reset the store state before each test
    useStore.setState({
      env: {},
      testCases: [],
      description: '',
      providers: [],
      prompts: [],
      extensions: [],
      defaultTest: {},
      derivedMetrics: [],
      evaluateOptions: {},
      scenarios: [],
    });
  });

  describe('defaultTest handling', () => {
    it('should accept string defaultTest', () => {
      const stringDefaultTest = 'file://path/to/defaultTest.yaml';

      useStore.getState().setDefaultTest(stringDefaultTest);

      expect(useStore.getState().defaultTest).toBe(stringDefaultTest);
    });

    it('should accept object defaultTest', () => {
      const objectDefaultTest = {
        assert: [{ type: 'equals' as const, value: 'test' }],
        vars: { foo: 'bar' },
        options: { provider: 'openai:gpt-4' },
      };

      useStore.getState().setDefaultTest(objectDefaultTest as any);

      expect(useStore.getState().defaultTest).toEqual(objectDefaultTest);
    });

    it('should handle undefined defaultTest', () => {
      // Set to undefined explicitly
      useStore.getState().setDefaultTest(undefined as any);

      // When set to undefined, it becomes undefined
      expect(useStore.getState().defaultTest).toBeUndefined();
    });

    it('should update from object to string defaultTest', () => {
      const objectDefaultTest = {
        assert: [{ type: 'equals' as const, value: 'test' }],
        vars: { foo: 'bar' },
      };

      useStore.getState().setDefaultTest(objectDefaultTest as any);
      expect(useStore.getState().defaultTest).toEqual(objectDefaultTest);

      const stringDefaultTest = 'file://new/path/defaultTest.yaml';
      useStore.getState().setDefaultTest(stringDefaultTest);

      expect(useStore.getState().defaultTest).toBe(stringDefaultTest);
    });

    it('should update from string to object defaultTest', () => {
      const stringDefaultTest = 'file://path/to/defaultTest.yaml';

      useStore.getState().setDefaultTest(stringDefaultTest);
      expect(useStore.getState().defaultTest).toBe(stringDefaultTest);

      const objectDefaultTest = {
        assert: [{ type: 'contains' as const, value: 'new' }],
        metadata: { suite: 'test' },
      };
      useStore.getState().setDefaultTest(objectDefaultTest as any);

      expect(useStore.getState().defaultTest).toEqual(objectDefaultTest);
    });
  });

  describe('getTestSuite', () => {
    it('should return config with string defaultTest', () => {
      const stringDefaultTest = 'file://shared/defaultTest.yaml';

      useStore.getState().setDescription('Test config');
      useStore.getState().setProviders([{ id: 'openai:gpt-4' }]);
      useStore.getState().setPrompts(['Test prompt']);
      useStore.getState().setDefaultTest(stringDefaultTest);

      const config = useStore.getState().getTestSuite();

      expect(config.defaultTest).toBe(stringDefaultTest);
      expect(config.description).toBe('Test config');
    });

    it('should return config with object defaultTest', () => {
      const objectDefaultTest = {
        assert: [{ type: 'equals' as const, value: 'test' }],
        vars: { foo: 'bar' },
      };

      useStore.getState().setDescription('Test config');
      useStore.getState().setProviders([{ id: 'openai:gpt-4' }]);
      useStore.getState().setPrompts(['Test prompt']);
      useStore.getState().setDefaultTest(objectDefaultTest as any);

      const config = useStore.getState().getTestSuite();

      expect(config.defaultTest).toEqual(objectDefaultTest);
    });
  });

  describe('setStateFromConfig', () => {
    it('should handle string defaultTest in config', () => {
      const config = {
        description: 'Test suite',
        defaultTest: 'file://external/defaultTest.yaml',
        providers: [{ id: 'openai:gpt-4' }],
        prompts: ['Test prompt'],
      };

      useStore.getState().setStateFromConfig(config);

      expect(useStore.getState().defaultTest).toBe('file://external/defaultTest.yaml');
      expect(useStore.getState().description).toBe('Test suite');
    });

    it('should handle object defaultTest in config', () => {
      const defaultTestObj = {
        assert: [{ type: 'equals' as const, value: 'expected' }],
        vars: { test: 'value' },
      };

      const config = {
        description: 'Test suite',
        defaultTest: defaultTestObj as any,
        providers: [{ id: 'openai:gpt-4' }],
      };

      useStore.getState().setStateFromConfig(config);

      expect(useStore.getState().defaultTest).toEqual(defaultTestObj);
    });
  });
});
