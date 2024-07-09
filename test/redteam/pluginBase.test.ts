import { PluginBase } from '../../src/redteam/plugins/base';
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
    expect.assertions(2);
    await expect(plugin.generateTests()).resolves.toEqual([
      {
        vars: { testVar: 'test prompt' },
        assert: [{ type: 'assertion', value: 'test prompt' }],
      },
      {
        vars: { testVar: 'another prompt' },
        assert: [{ type: 'assertion', value: 'another prompt' }],
      },
    ]);
    expect(provider.callApi).toHaveBeenCalledWith(
      getNunjucksEngine().renderString('Test template with {{ purpose }}', {
        purpose: 'test purpose',
      }),
    );
  });

  it('should throw an error if generatedPrompts is not a string', async () => {
    expect.assertions(1);
    jest.mocked(provider.callApi).mockResolvedValue({ output: 123 });

    await expect(plugin.generateTests()).rejects.toThrow(
      'Expected generatedPrompts to be a string',
    );
  });

  it('should filter and process prompts correctly', async () => {
    expect.assertions(1);
    await expect(plugin.generateTests()).resolves.toEqual([
      { assert: [{ type: 'assertion', value: 'test prompt' }], vars: { testVar: 'test prompt' } },
      {
        assert: [{ type: 'assertion', value: 'another prompt' }],
        vars: { testVar: 'another prompt' },
      },
    ]);
  });
});
