import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomPlugin, loadCustomPluginDefinition } from '../../../src/redteam/plugins/custom';
import { maybeLoadFromExternalFile } from '../../../src/util/file';

import type { ApiProvider, CallApiFunction } from '../../../src/types/index';

vi.mock('../../../src/util/file', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    maybeLoadFromExternalFile: vi.fn(),
  };
});

describe('CustomPlugin', () => {
  let plugin: CustomPlugin;
  let mockProvider: ApiProvider;

  beforeEach(() => {
    mockProvider = {
      callApi: vi.fn() as CallApiFunction,
      id: vi.fn().mockReturnValue('test-provider'),
    };

    vi.mocked(maybeLoadFromExternalFile).mockImplementation(function () {
      return {
        generator: 'Generate {{ n }} test prompts for {{ purpose }}',
        grader: 'Grade the response based on {{ purpose }}',
      };
    });

    plugin = new CustomPlugin(
      mockProvider,
      'test-purpose',
      'testVar',
      'path/to/custom-plugin.json',
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should generate test cases correctly with proper templating', async () => {
    const mockApiResponse = 'Prompt: Test prompt 1\nPrompt: Test prompt 2';
    vi.spyOn(mockProvider, 'callApi').mockResolvedValue({ output: mockApiResponse });

    await expect(plugin.generateTests(2)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          vars: { testVar: 'Test prompt 1' },
          assert: [
            {
              type: 'llm-rubric',
              value: 'Grade the response based on test-purpose',
              metric: 'custom',
            },
          ],
        }),
        expect.objectContaining({
          vars: { testVar: 'Test prompt 2' },
        }),
      ]),
    );

    expect(mockProvider.callApi).toHaveBeenCalledWith(
      expect.stringContaining('Generate 2 test prompts for test-purpose'),
    );
  });

  it('should use the correct template for getTemplate', async () => {
    const template = await plugin['getTemplate']();
    expect(template).toBe('Generate {{ n }} test prompts for {{ purpose }}');
  });

  it('should set canGenerateRemote to false', () => {
    expect(CustomPlugin.canGenerateRemote).toBe(false);
  });

  it('should render the grader template with the correct purpose', () => {
    const assertions = plugin['getAssertions']('Some prompt');
    expect(assertions).toEqual([
      { type: 'llm-rubric', value: 'Grade the response based on test-purpose', metric: 'custom' },
    ]);
  });

  it('should include threshold in assertions when specified', () => {
    vi.mocked(maybeLoadFromExternalFile).mockImplementation(function () {
      return {
        generator: 'Generate {{ n }} test prompts for {{ purpose }}',
        grader: 'Grade the response based on {{ purpose }}',
        threshold: 0.8,
      };
    });

    const pluginWithThreshold = new CustomPlugin(
      mockProvider,
      'test-purpose',
      'testVar',
      'path/to/custom-plugin.json',
    );

    const assertions = pluginWithThreshold['getAssertions']('Some prompt');
    expect(assertions).toEqual([
      {
        type: 'llm-rubric',
        value: 'Grade the response based on test-purpose',
        threshold: 0.8,
        metric: 'custom',
      },
    ]);
  });

  it('should not include threshold in assertions when not specified', () => {
    vi.mocked(maybeLoadFromExternalFile).mockImplementation(function () {
      return {
        generator: 'Generate {{ n }} test prompts for {{ purpose }}',
        grader: 'Grade the response based on {{ purpose }}',
      };
    });

    const pluginWithoutThreshold = new CustomPlugin(
      mockProvider,
      'test-purpose',
      'testVar',
      'path/to/custom-plugin.json',
    );

    const assertions = pluginWithoutThreshold['getAssertions']('Some prompt');
    expect(assertions).toEqual([
      { type: 'llm-rubric', value: 'Grade the response based on test-purpose', metric: 'custom' },
    ]);
    expect(assertions[0]).not.toHaveProperty('threshold');
  });

  it('should use the correct metric name', () => {
    vi.mocked(maybeLoadFromExternalFile).mockImplementation(function () {
      return {
        generator: 'Valid generator template',
        grader: 'Valid grader template',
        metric: 'my-custom-metric',
      };
    });

    const pluginWithMetric = new CustomPlugin(
      mockProvider,
      'test-purpose',
      'testVar',
      'path/to/custom-plugin.json',
    );

    expect(pluginWithMetric['getMetricName']()).toBe('my-custom-metric');
  });

  it('should use the default metric name if not specified', () => {
    vi.mocked(maybeLoadFromExternalFile).mockImplementation(function () {
      return {
        generator: 'Valid generator template',
        grader: 'Valid grader template',
      };
    });

    const pluginWithoutMetric = new CustomPlugin(
      mockProvider,
      'test-purpose',
      'testVar',
      'path/to/custom-plugin.json',
    );

    expect(pluginWithoutMetric['getMetricName']()).toBe('custom');
  });

  it('should include the metric name in the assertion', () => {
    vi.mocked(maybeLoadFromExternalFile).mockImplementation(function () {
      return {
        generator: 'Valid generator template',
        grader: 'Valid grader template',
        metric: 'my-custom-metric',
      };
    });

    const pluginWithMetric = new CustomPlugin(
      mockProvider,
      'test-purpose',
      'testVar',
      'path/to/custom-plugin.json',
    );

    const assertions = pluginWithMetric['getAssertions']('Some prompt');
    expect(assertions).toEqual([
      {
        type: 'llm-rubric',
        value: 'Valid grader template',
        metric: 'my-custom-metric',
      },
    ]);
  });
});

describe('loadCustomPluginDefinition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should load a valid custom plugin definition', () => {
    vi.mocked(maybeLoadFromExternalFile).mockImplementation(function () {
      return {
        generator: 'Valid generator template',
        grader: 'Valid grader template',
      };
    });

    const result = loadCustomPluginDefinition('path/to/valid-plugin.json');

    expect(result).toEqual({
      generator: 'Valid generator template',
      grader: 'Valid grader template',
    });
  });

  it('should load a valid custom plugin definition with threshold', () => {
    vi.mocked(maybeLoadFromExternalFile).mockImplementation(function () {
      return {
        generator: 'Valid generator template',
        grader: 'Valid grader template',
        threshold: 0.7,
      };
    });

    const result = loadCustomPluginDefinition('path/to/valid-plugin.json');

    expect(result).toEqual({
      generator: 'Valid generator template',
      grader: 'Valid grader template',
      threshold: 0.7,
    });
  });

  it('should load a valid custom plugin definition with optional id', () => {
    vi.mocked(maybeLoadFromExternalFile).mockImplementation(function () {
      return {
        generator: 'Valid generator template',
        grader: 'Valid grader template',
        threshold: 1.0,
        id: 'custom-plugin-id',
      };
    });

    const result = loadCustomPluginDefinition('path/to/valid-plugin.json');

    expect(result).toEqual({
      generator: 'Valid generator template',
      grader: 'Valid grader template',
      threshold: 1.0,
      id: 'custom-plugin-id',
    });
  });

  it('should throw an error for an invalid custom plugin definition', () => {
    vi.mocked(maybeLoadFromExternalFile).mockImplementation(function () {
      return {
        generator: '',
        grader: 'Valid grader template',
      };
    });

    expect(() => loadCustomPluginDefinition('path/to/invalid-plugin.json')).toThrow(
      'Custom Plugin Schema Validation Error',
    );
  });

  it('should throw an error when the plugin definition is missing a required field', () => {
    vi.mocked(maybeLoadFromExternalFile).mockImplementation(function () {
      return {
        generator: 'Valid generator template',
      };
    });

    expect(() => loadCustomPluginDefinition('path/to/invalid-plugin.json')).toThrow(
      'Custom Plugin Schema Validation Error',
    );
  });

  it('should throw an error when the plugin definition contains extra fields', () => {
    vi.mocked(maybeLoadFromExternalFile).mockImplementation(function () {
      return {
        generator: 'Valid generator template',
        grader: 'Valid grader template',
        extraField: 'This should not be here',
      };
    });

    expect(() => loadCustomPluginDefinition('path/to/invalid-plugin.json')).toThrow(
      'Custom Plugin Schema Validation Error',
    );
  });

  it('should throw an error when threshold is not a number', () => {
    vi.mocked(maybeLoadFromExternalFile).mockImplementation(function () {
      return {
        generator: 'Valid generator template',
        grader: 'Valid grader template',
        threshold: 'invalid',
      };
    });

    expect(() => loadCustomPluginDefinition('path/to/invalid-plugin.json')).toThrow(
      'Custom Plugin Schema Validation Error',
    );
  });
});
