import { CustomPlugin, loadCustomPluginDefinition } from '../../../src/redteam/plugins/custom';
import type { ApiProvider } from '../../../src/types';
import { maybeLoadFromExternalFile } from '../../../src/util';

jest.mock('../../../src/util', () => ({
  maybeLoadFromExternalFile: jest.fn(),
}));

describe('CustomPlugin', () => {
  let plugin: CustomPlugin;
  let mockProvider: ApiProvider;

  beforeEach(async () => {
    mockProvider = {
      callApi: jest.fn(),
      id: jest.fn().mockReturnValue('test-provider'),
    };

    jest.mocked(maybeLoadFromExternalFile).mockResolvedValue({
      generator: 'Generate {{ n }} test prompts for {{ purpose }}',
      grader: 'Grade the response based on {{ purpose }}',
    });

    plugin = await CustomPlugin.create(
      mockProvider,
      'test-purpose',
      'testVar',
      'path/to/custom-plugin.json',
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should generate test cases correctly with proper templating', async () => {
    const mockApiResponse = 'Prompt: Test prompt 1\nPrompt: Test prompt 2';
    jest.spyOn(mockProvider, 'callApi').mockResolvedValue({ output: mockApiResponse });

    await expect(plugin.generateTests(2)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          vars: { testVar: 'Test prompt 1' },
          assert: [{ type: 'llm-rubric', value: 'Grade the response based on test-purpose' }],
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

  it('should render the grader template with the correct purpose', () => {
    const assertions = plugin['getAssertions']('Some prompt');
    expect(assertions).toEqual([
      { type: 'llm-rubric', value: 'Grade the response based on test-purpose' },
    ]);
  });
});

describe('loadCustomPluginDefinition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should load a valid custom plugin definition', async () => {
    jest.mocked(maybeLoadFromExternalFile).mockResolvedValue({
      generator: 'Valid generator template',
      grader: 'Valid grader template',
    });

    const result = await loadCustomPluginDefinition('path/to/valid-plugin.json');

    expect(result).toEqual({
      generator: 'Valid generator template',
      grader: 'Valid grader template',
    });
  });

  it('should throw an error for an invalid custom plugin definition', async () => {
    jest.mocked(maybeLoadFromExternalFile).mockResolvedValue({
      generator: '',
      grader: 'Valid grader template',
    });

    await expect(loadCustomPluginDefinition('path/to/invalid-plugin.json')).rejects.toThrow(
      'Custom Plugin Schema Validation Error',
    );
  });

  it('should throw an error when the plugin definition is missing a required field', async () => {
    jest.mocked(maybeLoadFromExternalFile).mockResolvedValue({
      generator: 'Valid generator template',
    });

    await expect(loadCustomPluginDefinition('path/to/invalid-plugin.json')).rejects.toThrow(
      'Custom Plugin Schema Validation Error',
    );
  });

  it('should throw an error when the plugin definition contains extra fields', async () => {
    jest.mocked(maybeLoadFromExternalFile).mockResolvedValue({
      generator: 'Valid generator template',
      grader: 'Valid grader template',
      extraField: 'This should not be here',
    });

    await expect(loadCustomPluginDefinition('path/to/invalid-plugin.json')).rejects.toThrow(
      'Custom Plugin Schema Validation Error',
    );
  });
});
