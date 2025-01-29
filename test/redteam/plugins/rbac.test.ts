import { RbacPlugin } from '../../../src/redteam/plugins/rbac';
import type { ApiProvider, ProviderResponse } from '../../../src/types';

describe('RbacPlugin', () => {
  let mockProvider: ApiProvider;

  beforeEach(() => {
    mockProvider = {
      id: 'test-provider',
      callApi: jest.fn().mockResolvedValue({
        output: `Prompt: Test prompt 1`,
      } as ProviderResponse),
    } as unknown as ApiProvider;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should generate test cases with default examples when no examples provided', async () => {
    const plugin = new RbacPlugin(mockProvider, 'test purpose', 'test_var');
    const testCases = await plugin.generateTests(1);

    expect(testCases).toHaveLength(1);
    expect(testCases[0]?.vars).toBeDefined();
    expect(testCases[0]?.vars?.test_var).toBe('Test prompt 1');
    expect(testCases[0]?.assert).toBeDefined();
    expect(testCases[0]?.assert?.[0].type).toBe('promptfoo:redteam:rbac');
    expect(testCases[0]?.assert?.[0].metric).toBe('RbacEnforcement');
  });

  it('should generate test cases with the specified number of prompts', async () => {
    const plugin = new RbacPlugin(mockProvider, 'test purpose', 'test_var');
    const testCases = await plugin.generateTests(3);

    expect(testCases).toHaveLength(1);
    testCases.forEach((testCase) => {
      expect(testCase.vars).toBeDefined();
      expect(testCase.assert).toBeDefined();
      expect(testCase.assert?.[0].type).toBe('promptfoo:redteam:rbac');
      expect(testCase.assert?.[0].metric).toBe('RbacEnforcement');
    });
  });

  it('should respect delay between API calls', async () => {
    const plugin = new RbacPlugin(mockProvider, 'test purpose', 'test_var');
    const delayMs = 100;

    const startTime = Date.now();
    await plugin.generateTests(2, delayMs);
    const endTime = Date.now();

    expect(endTime - startTime).toBeGreaterThanOrEqual(delayMs);
  });

  it('should generate assertions for each prompt', async () => {
    const plugin = new RbacPlugin(mockProvider, 'test purpose', 'test_var');
    const testCases = await plugin.generateTests(1);

    expect(testCases[0]?.assert).toEqual([
      {
        type: 'promptfoo:redteam:rbac',
        metric: 'RbacEnforcement',
      },
    ]);
  });

  it('should handle API errors gracefully', async () => {
    const mockError = new Error('API Error');
    jest.spyOn(mockProvider, 'callApi').mockRejectedValue(mockError);
    const plugin = new RbacPlugin(mockProvider, 'test purpose', 'test_var');

    await expect(plugin.generateTests(1)).rejects.toThrow('API Error');
  });

  it('should handle empty API response', async () => {
    jest.spyOn(mockProvider, 'callApi').mockResolvedValue({
      output: '',
    } as ProviderResponse);
    const plugin = new RbacPlugin(mockProvider, 'test purpose', 'test_var');

    const testCases = await plugin.generateTests(1);
    expect(testCases).toHaveLength(0);
  });

  it('should handle responses without Prompt: prefix', async () => {
    jest.spyOn(mockProvider, 'callApi').mockResolvedValue({
      output: 'Test prompt without prefix',
    } as ProviderResponse);
    const plugin = new RbacPlugin(mockProvider, 'test purpose', 'test_var');

    const testCases = await plugin.generateTests(1);
    expect(testCases).toHaveLength(0);
  });
});
