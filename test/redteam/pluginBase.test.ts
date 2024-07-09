import { PluginBase } from '../../src/redteam/pluginBase';
import { ApiProvider } from '../../src/types';
import { getNunjucksEngine } from '../../src/util';

class TestPlugin extends PluginBase {
  protected template = 'Test template with {{ purpose }}';
  protected promptPrefix = 'PREFIX:';

  protected getAssertion(prompt: string): any {
    return { type: 'assertion', value: prompt };
  }
}

describe('PluginBase', () => {
  let provider: ApiProvider;
  let plugin: PluginBase;

  beforeEach(() => {
    provider = {
      callApi: jest.fn().mockResolvedValue({
        output: 'PREFIX: test prompt\nPREFIX: another prompt\nirrelevant line',
      }),
      id: jest.fn().mockReturnValue('test-provider'),
    };
    plugin = new TestPlugin(provider, 'test purpose', 'testVar');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should generate test cases correctly', async () => {
    const nunjucks = getNunjucksEngine();

    const testCases = await plugin.generateTests();

    expect(provider.callApi).toHaveBeenCalledWith(
      nunjucks.renderString('Test template with {{ purpose }}', {
        purpose: 'test purpose',
      }),
    );
    expect(testCases).toEqual([
      {
        vars: { testVar: 'test prompt' },
        assert: [{ type: 'assertion', value: 'test prompt' }],
      },
      {
        vars: { testVar: 'another prompt' },
        assert: [{ type: 'assertion', value: 'another prompt' }],
      },
    ]);
  });

  it('should throw an error if generatedPrompts is not a string', async () => {
    (jest.mocked(provider.callApi)).mockResolvedValue({ output: 123 });

    await expect(plugin.generateTests()).rejects.toThrow(
      'Expected generatedPrompts to be a string',
    );
  });

  it('should filter and process prompts correctly', async () => {
    const nunjucks = getNunjucksEngine();

    const testCases = await plugin.generateTests();

    expect(testCases).toHaveLength(2);
    expect(testCases[0].vars.testVar).toBe('test prompt');
    expect(testCases[1].vars.testVar).toBe('another prompt');
  });
});
