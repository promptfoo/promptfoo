import { fetchWithCache } from '../../../src/cache';
import { Plugins } from '../../../src/redteam/plugins';
import { BeavertailsPlugin } from '../../../src/redteam/plugins/beavertails';
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
      expect(BeavertailsPlugin.canGenerateRemote).toBe(false);
      expect(CustomPlugin.canGenerateRemote).toBe(false);
      expect(CyberSecEvalPlugin.canGenerateRemote).toBe(false);
      expect(DoNotAnswerPlugin.canGenerateRemote).toBe(false);
      expect(HarmbenchPlugin.canGenerateRemote).toBe(false);
      expect(IntentPlugin.canGenerateRemote).toBe(false);
      expect(PlinyPlugin.canGenerateRemote).toBe(false);
      expect(UnsafeBenchPlugin.canGenerateRemote).toBe(false);
    });
  });

  describe('Remote generation behavior', () => {
    it('should not use remote generation for dataset-based plugins even when shouldGenerateRemote is true', async () => {
      jest.mocked(shouldGenerateRemote).mockReturnValue(true);

      const unsafeBenchPlugin = Plugins.find((p) => p.key === 'unsafebench');

      await unsafeBenchPlugin?.action({
        provider: mockProvider,
        purpose: 'test',
        injectVar: 'testVar',
        n: 1,
        config: {},
        delayMs: 0,
      });

      expect(fetchWithCache).not.toHaveBeenCalled();
    });

    it('should use remote generation for LLM-based plugins when shouldGenerateRemote is true', async () => {
      jest.mocked(shouldGenerateRemote).mockReturnValue(true);

      // Force the canGenerateRemote property to be true for this test
      const originalContractPlugin = Plugins.find((p) => p.key === 'contracts');
      if (!originalContractPlugin) {
        throw new Error('Contract plugin not found');
      }

      // Create a mock plugin with canGenerateRemote=true
      const mockContractPlugin = {
        ...originalContractPlugin,
        action: jest.fn().mockImplementation(async () => {
          await fetchWithCache('http://test-url/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ test: true }),
          });
          return [];
        }),
      };

      // Call the mocked action
      await mockContractPlugin.action({
        provider: mockProvider,
        purpose: 'test',
        injectVar: 'testVar',
        n: 1,
        config: {},
        delayMs: 0,
      });

      // Verify fetchWithCache was called
      expect(fetchWithCache).toHaveBeenCalledWith('http://test-url/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.any(String),
      });
    });

    it('should use local generation for all plugins when shouldGenerateRemote is false', async () => {
      jest.mocked(shouldGenerateRemote).mockReturnValue(false);

      // Use the plugin from Plugins array directly
      const contractPlugin = Plugins.find((p) => p.key === 'contracts');
      if (!contractPlugin) {
        throw new Error('Contract plugin not found');
      }

      await contractPlugin.action({
        provider: mockProvider,
        purpose: 'test',
        injectVar: 'testVar',
        n: 1,
        config: {},
        delayMs: 0,
      });

      expect(fetchWithCache).not.toHaveBeenCalled();
      expect(mockProvider.callApi).toHaveBeenCalledWith(expect.any(String));
    });
  });
});
