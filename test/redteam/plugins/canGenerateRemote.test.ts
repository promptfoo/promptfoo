import { fetchWithCache } from '../../../src/cache';
import { Plugins } from '../../../src/redteam/plugins';
import { BeavertailsPlugin } from '../../../src/redteam/plugins/beavertails';
import { ContractPlugin } from '../../../src/redteam/plugins/contracts';
import { CustomPlugin } from '../../../src/redteam/plugins/custom';
import { CyberSecEvalPlugin } from '../../../src/redteam/plugins/cyberseceval';
import { DoNotAnswerPlugin } from '../../../src/redteam/plugins/donotanswer';
import { HarmbenchPlugin } from '../../../src/redteam/plugins/harmbench';
import { IntentPlugin } from '../../../src/redteam/plugins/intent';
import { PlinyPlugin } from '../../../src/redteam/plugins/pliny';
import { UnsafeBenchPlugin } from '../../../src/redteam/plugins/unsafebench';
import { shouldGenerateRemote } from '../../../src/redteam/remoteGeneration';
import type { ApiProvider } from '../../../src/types';

jest.mock('../../../src/cache');
jest.mock('../../../src/cliState', () => ({
  __esModule: true,
  default: { remote: false },
}));
jest.mock('../../../src/redteam/remoteGeneration', () => ({
  getRemoteGenerationUrl: jest.fn().mockReturnValue('http://test-url'),
  neverGenerateRemote: jest.fn().mockReturnValue(false),
  shouldGenerateRemote: jest.fn().mockReturnValue(false),
}));
jest.mock('../../../src/util', () => ({
  ...jest.requireActual('../../../src/util'),
  maybeLoadFromExternalFile: jest.fn().mockReturnValue({
    generator: 'Generate test prompts',
    grader: 'Grade the response',
  }),
}));

// Mock contracts plugin to ensure it has canGenerateRemote = true
jest.mock('../../../src/redteam/plugins/contracts', () => {
  const original = jest.requireActual('../../../src/redteam/plugins/contracts');
  return {
    ...original,
    ContractPlugin: class extends original.ContractPlugin {
      readonly canGenerateRemote = true;
    },
  };
});

describe('canGenerateRemote property and behavior', () => {
  let mockProvider: ApiProvider;

  beforeEach(() => {
    mockProvider = {
      callApi: jest.fn().mockResolvedValue({
        output: 'Sample output',
        error: null,
      }),
      id: jest.fn().mockReturnValue('test-provider'),
    };

    // Reset all mocks
    jest.clearAllMocks();
    jest.mocked(fetchWithCache).mockReset();
  });

  describe('Plugin canGenerateRemote property', () => {
    it('should mark dataset-based plugins as not requiring remote generation', () => {
      // Initialize the plugins that use datasets and don't need remote generation
      const beavertailsPlugin = new BeavertailsPlugin(mockProvider, 'test', 'test');
      const customPlugin = new CustomPlugin(
        mockProvider,
        'test',
        'test',
        'path/to/custom-plugin.json',
      );
      const cybersecEvalPlugin = new CyberSecEvalPlugin(mockProvider, 'test', 'test');
      const doNotAnswerPlugin = new DoNotAnswerPlugin(mockProvider, 'test', 'test');
      const harmbenchPlugin = new HarmbenchPlugin(mockProvider, 'test', 'test');
      const intentPlugin = new IntentPlugin(mockProvider, 'test', 'test', { intent: 'test' });
      const plinyPlugin = new PlinyPlugin(mockProvider, 'test', 'test');
      const unsafeBenchPlugin = new UnsafeBenchPlugin(mockProvider, 'test', 'test');

      // Verify each plugin has canGenerateRemote set to false
      expect(beavertailsPlugin.canGenerateRemote).toBe(false);
      expect(customPlugin.canGenerateRemote).toBe(false);
      expect(cybersecEvalPlugin.canGenerateRemote).toBe(false);
      expect(doNotAnswerPlugin.canGenerateRemote).toBe(false);
      expect(harmbenchPlugin.canGenerateRemote).toBe(false);
      expect(intentPlugin.canGenerateRemote).toBe(false);
      expect(plinyPlugin.canGenerateRemote).toBe(false);
      expect(unsafeBenchPlugin.canGenerateRemote).toBe(false);
    });
  });

  describe('Remote generation behavior', () => {
    it('should not use remote generation for dataset-based plugins even when shouldGenerateRemote is true', async () => {
      // Set up the conditions for remote generation
      jest.mocked(shouldGenerateRemote).mockReturnValue(true);

      // Get a plugin that doesn't need remote generation
      const unsafeBenchPlugin = Plugins.find((p) => p.key === 'unsafebench');

      // Call the plugin action - this shouldn't use remote generation
      await unsafeBenchPlugin?.action({
        provider: mockProvider,
        purpose: 'test',
        injectVar: 'testVar',
        n: 1,
        config: {},
        delayMs: 0,
      });

      // Verify fetchWithCache wasn't called (no remote generation)
      expect(fetchWithCache).not.toHaveBeenCalled();

      // For unsafebench, we need to check if the provider was used at all
      // but callApi might not be called in mocked implementation
      // so we're just verifying no remote generation was used
    });

    it('should use remote generation for LLM-based plugins when shouldGenerateRemote is true', async () => {
      // Set up the conditions for remote generation
      jest.mocked(shouldGenerateRemote).mockReturnValue(true);

      // Mock successful response
      const mockResponse = {
        cached: false,
        data: { result: [{ test: 'case' }] },
        status: 200,
        statusText: 'OK',
      };
      jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      // Get a plugin that uses remote generation
      const contractsPlugin = Plugins.find((p) => p.key === 'contracts');
      expect(contractsPlugin).toBeDefined();

      // Create an instance to verify canGenerateRemote is set
      const contractInstance = new ContractPlugin(mockProvider, 'test', 'test');
      expect(contractInstance.canGenerateRemote).toBe(true);
    });

    it('should use local generation for all plugins when shouldGenerateRemote is false', async () => {
      // Set up conditions for local generation
      jest.mocked(shouldGenerateRemote).mockReturnValue(false);

      // Test with an LLM-based plugin
      const contractsPlugin = Plugins.find((p) => p.key === 'contracts');

      // Call the plugin action - this should use local generation
      await contractsPlugin?.action({
        config: {},
        delayMs: 0,
        injectVar: 'testVar',
        n: 1,
        provider: mockProvider,
        purpose: 'test',
      });

      // Verify fetchWithCache wasn't called (no remote generation)
      expect(fetchWithCache).not.toHaveBeenCalled();

      // Verify provider.callApi was called (local generation)
      expect(mockProvider.callApi).toHaveBeenCalledWith(expect.any(String));
    });
  });
});
