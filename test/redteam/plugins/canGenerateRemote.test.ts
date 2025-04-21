import { fetchWithCache } from '../../../src/cache';
import { shouldGenerateRemote } from '../../../src/redteam/remoteGeneration';
import { Plugins } from '../../../src/redteam/plugins';
import { UnsafeBenchPlugin } from '../../../src/redteam/plugins/unsafebench';
import { BeavertailsPlugin } from '../../../src/redteam/plugins/beavertails';
import { HarmbenchPlugin } from '../../../src/redteam/plugins/harmbench';
import { CyberSecEvalPlugin } from '../../../src/redteam/plugins/cyberseceval';
import { PlinyPlugin } from '../../../src/redteam/plugins/pliny';
import { DoNotAnswerPlugin } from '../../../src/redteam/plugins/donotanswer';
import { IntentPlugin } from '../../../src/redteam/plugins/intent';
import type { ApiProvider } from '../../../src/types';

// Mock dependencies
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
      const unsafeBenchPlugin = new UnsafeBenchPlugin(mockProvider, 'test', 'test');
      const beavertailsPlugin = new BeavertailsPlugin(mockProvider, 'test', 'test');
      const harmbenchPlugin = new HarmbenchPlugin(mockProvider, 'test', 'test');
      const cybersecEvalPlugin = new CyberSecEvalPlugin(mockProvider, 'test', 'test');
      const plinyPlugin = new PlinyPlugin(mockProvider, 'test', 'test');
      const doNotAnswerPlugin = new DoNotAnswerPlugin(mockProvider, 'test', 'test');
      const intentPlugin = new IntentPlugin(mockProvider, 'test', 'test', { intent: 'test' });

      // Verify each plugin has canGenerateRemote set to false
      expect(unsafeBenchPlugin.canGenerateRemote).toBe(false);
      expect(beavertailsPlugin.canGenerateRemote).toBe(false);
      expect(harmbenchPlugin.canGenerateRemote).toBe(false);
      expect(cybersecEvalPlugin.canGenerateRemote).toBe(false);
      expect(plinyPlugin.canGenerateRemote).toBe(false);
      expect(doNotAnswerPlugin.canGenerateRemote).toBe(false);
      expect(intentPlugin.canGenerateRemote).toBe(false);
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

      // Verify provider.callApi was called (local generation)
      expect(mockProvider.callApi).toHaveBeenCalledWith(expect.any(String));
    });

    it('should use remote generation for LLM-based plugins when shouldGenerateRemote is true', async () => {
      // Set up the conditions for remote generation
      jest.mocked(shouldGenerateRemote).mockReturnValue(true);
      
      // Mock successful response
      jest.mocked(fetchWithCache).mockResolvedValue({
        data: { result: [{ test: 'case' }] },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      // Get a plugin that needs remote generation
      const contractsPlugin = Plugins.find((p) => p.key === 'contracts');

      // Call the plugin action - this should use remote generation
      await contractsPlugin?.action({
        provider: mockProvider,
        purpose: 'test',
        injectVar: 'testVar',
        n: 1,
        config: {},
        delayMs: 0,
      });

      // Verify fetchWithCache was called (remote generation)
      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
        expect.any(Number)
      );
    });

    it('should use local generation for all plugins when shouldGenerateRemote is false', async () => {
      // Set up conditions for local generation
      jest.mocked(shouldGenerateRemote).mockReturnValue(false);

      // Test with an LLM-based plugin
      const contractsPlugin = Plugins.find((p) => p.key === 'contracts');
      
      // Call the plugin action - this should use local generation
      await contractsPlugin?.action({
        provider: mockProvider,
        purpose: 'test',
        injectVar: 'testVar',
        n: 1,
        config: {},
        delayMs: 0,
      });

      // Verify fetchWithCache wasn't called (no remote generation)
      expect(fetchWithCache).not.toHaveBeenCalled();
      
      // Verify provider.callApi was called (local generation)
      expect(mockProvider.callApi).toHaveBeenCalledWith(expect.any(String));
    });
  });
}); 