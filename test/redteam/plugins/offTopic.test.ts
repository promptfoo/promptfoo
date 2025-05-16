import {
  OffTopicPlugin,
  OffTopicGrader,
  PLUGIN_ID,
  INITIAL_PROMPT_TEMPLATES,
} from '../../../src/redteam/plugins/offTopic';

jest.mock('../../../src/logger');

describe('OffTopicPlugin', () => {
  let mockProvider: any;
  let plugin: OffTopicPlugin;

  beforeEach(() => {
    mockProvider = {
      id: jest.fn().mockReturnValue('test-provider'),
      callApi: jest.fn(),
    };
    plugin = new OffTopicPlugin(mockProvider, 'test purpose', 'input', {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with correct config', () => {
    expect(plugin.id).toBe(PLUGIN_ID);
    expect(plugin['config'].injectVar).toBe('input');
  });

  it('should throw error if injectVar is not provided', () => {
    expect(() => {
      new OffTopicPlugin(mockProvider, 'test purpose', '', {});
    }).toThrow('injectVar must be specified for off-topic plugin');
  });

  it('should return empty template string', async () => {
    const template = await plugin['getTemplate']();
    expect(template).toBe('');
  });

  it('should return correct assertions', () => {
    const assertions = plugin['getAssertions']();
    expect(assertions).toEqual([
      {
        type: PLUGIN_ID,
        metric: 'OffTopic',
      },
    ]);
  });

  it('should call original provider in callApi', async () => {
    const mockContext = {
      originalProvider: {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({ output: 'test response' }),
      },
      prompt: {
        raw: 'test prompt',
        label: 'test',
      },
      vars: {},
    };

    const result = await plugin.callApi('test prompt', mockContext);
    expect(mockContext.originalProvider.callApi).toHaveBeenCalledWith(
      'test prompt',
      mockContext,
      undefined,
    );
    expect(result.output).toBe('test response');
  });

  it('should handle errors in callApi', async () => {
    const mockContext = {
      originalProvider: {
        id: () => 'test-provider',
        callApi: jest.fn().mockRejectedValue(new Error('test error')),
      },
      prompt: {
        raw: 'test prompt',
        label: 'test',
      },
      vars: {},
    };

    const result = await plugin.callApi('test prompt', mockContext);
    expect(result.output).toBe('An error occurred during the off-topic test.');
    expect(result.metadata?.error).toBe('Error: test error');
  });

  it('should generate correct number of test cases', async () => {
    const tests = await plugin.generateTests(3);
    expect(tests).toHaveLength(3);
    tests.forEach((test) => {
      expect(test.vars).toHaveProperty('input');
      expect(test.assert).toEqual([{ type: PLUGIN_ID }]);
      expect(test.provider).toBeDefined();
      expect(test.metadata?.pluginId).toBe(PLUGIN_ID);
    });
  });
});

describe('OffTopicGrader', () => {
  let grader: OffTopicGrader;

  beforeEach(() => {
    grader = new OffTopicGrader();
  });

  it('should have correct plugin ID', () => {
    expect(grader.id).toBe(PLUGIN_ID);
  });

  it('should have valid rubric template', () => {
    expect(grader.rubric).toContain('You are grading an AI Agent');
    expect(grader.rubric).toContain('{{purpose}}');
    expect(grader.rubric).toContain('The output must:');
  });
});

describe('INITIAL_PROMPT_TEMPLATES', () => {
  it('should contain valid prompt templates', () => {
    expect(INITIAL_PROMPT_TEMPLATES).toBeInstanceOf(Array);
    INITIAL_PROMPT_TEMPLATES.forEach((template) => {
      expect(template).toHaveProperty('description');
      expect(template).toHaveProperty('prompt');
      expect(typeof template.description).toBe('string');
      expect(typeof template.prompt).toBe('string');
    });
  });

  it('should have expected template types', () => {
    const descriptions = INITIAL_PROMPT_TEMPLATES.map((t) => t.description);
    expect(descriptions).toContain('Direct topic deviation attempt');
    expect(descriptions).toContain('Gradual topic shift');
    expect(descriptions).toContain('Personal topic injection');
    expect(descriptions).toContain('Emergency topic switch');
    expect(descriptions).toContain('Social engineering topic change');
  });
});
