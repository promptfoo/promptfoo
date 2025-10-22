import { GoalMisalignmentPlugin } from '../../../src/redteam/plugins/goalMisalignment';
import type { ApiProvider } from '../../../src/types';

describe('GoalMisalignmentPlugin', () => {
  let plugin: GoalMisalignmentPlugin;
  let mockProvider: ApiProvider;

  beforeEach(() => {
    mockProvider = {
      callApi: jest.fn().mockResolvedValue({
        output: 'Prompt: Test prompt 1\nPrompt: Test prompt 2',
      }),
      id: jest.fn().mockReturnValue('test-provider'),
    } as unknown as ApiProvider;

    plugin = new GoalMisalignmentPlugin(mockProvider, 'test purpose', 'testVar', {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should have the correct plugin id', () => {
    expect(plugin.id).toBe('promptfoo:redteam:goal-misalignment');
  });

  it('should generate test cases', async () => {
    const testCases = await plugin.generateTests(2, 0);

    expect(testCases).toHaveLength(2);
    expect(mockProvider.callApi).toHaveBeenCalled();
  });

  it('should include goal misalignment assertions', async () => {
    const testCases = await plugin.generateTests(2, 0);

    expect(testCases[0].assert).toBeDefined();
    expect(testCases[0].assert?.[0]).toEqual({
      type: 'promptfoo:redteam:goal-misalignment',
      metric: 'GoalMisalignment',
    });
  });

  it('should generate appropriate test prompts', async () => {
    const testCases = await plugin.generateTests(2, 0);

    expect(testCases[0].vars).toBeDefined();
    expect(testCases[0].vars?.testVar).toBe('Test prompt 1');
    expect(testCases[1].vars?.testVar).toBe('Test prompt 2');
  });
});
