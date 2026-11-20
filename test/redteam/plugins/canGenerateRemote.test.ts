import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { BeavertailsPlugin } from '../../../src/redteam/plugins/beavertails';
import { CustomPlugin } from '../../../src/redteam/plugins/custom';
import { CyberSecEvalPlugin } from '../../../src/redteam/plugins/cyberseceval';
import { DoNotAnswerPlugin } from '../../../src/redteam/plugins/donotanswer';
import { HarmbenchPlugin } from '../../../src/redteam/plugins/harmbench';
import {
  canPluginGenerateRemote,
  Plugins,
  willPluginGenerateRemote,
} from '../../../src/redteam/plugins/index';
import { IntentPlugin } from '../../../src/redteam/plugins/intent';
import { PlinyPlugin } from '../../../src/redteam/plugins/pliny';
import { UnsafeBenchPlugin } from '../../../src/redteam/plugins/unsafebench';
import { neverGenerateRemote, shouldGenerateRemote } from '../../../src/redteam/remoteGeneration';
import {
  createMockProvider,
  createProviderResponse,
  type MockApiProvider,
} from '../../factories/provider';

vi.mock('../../../src/cache');
vi.mock('../../../src/cliState', () => ({
  __esModule: true,
  default: { remote: false },
}));
vi.mock('../../../src/redteam/remoteGeneration', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getRemoteGenerationUrl: vi.fn().mockReturnValue('http://test-url'),
    neverGenerateRemote: vi.fn().mockReturnValue(false),
    shouldGenerateRemote: vi.fn().mockReturnValue(false),
  };
});
vi.mock('../../../src/util', async () => ({
  ...(await vi.importActual('../../../src/util')),

  maybeLoadFromExternalFile: vi.fn().mockReturnValue({
    generator: 'Generate test prompts',
    grader: 'Grade the response',
  }),
}));
vi.mock('../../../src/integrations/huggingfaceDatasets', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    fetchHuggingFaceDataset: vi
      .fn()
      .mockResolvedValue([{ vars: { prompt: 'test prompt', category: 'test' } }]),
  };
});

describe('canGenerateRemote property and behavior', () => {
  let mockProvider: MockApiProvider;

  beforeEach(() => {
    mockProvider = createMockProvider({
      response: createProviderResponse({
        output: 'Sample output',
        error: null as any,
      }),
    });

    // Reset all mocks
    vi.clearAllMocks();
    vi.mocked(fetchWithCache).mockReset();
    vi.mocked(shouldGenerateRemote).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
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

  describe('canPluginGenerateRemote and willPluginGenerateRemote', () => {
    it('returns false for custom file:// plugins, which CustomPlugin generates locally', () => {
      // Custom file:// plugins are never registered in Plugins, so the
      // lookup must not fail closed for this known local-only route.
      expect(canPluginGenerateRemote('file:///tmp/custom-plugin.yaml')).toBe(false);
      expect(willPluginGenerateRemote('file:///tmp/custom-plugin.yaml')).toBe(false);
    });

    it('still fails closed for other unknown plugin ids when remote generation is selected', () => {
      vi.mocked(neverGenerateRemote).mockReturnValue(false);
      vi.mocked(shouldGenerateRemote).mockReturnValue(true);
      expect(canPluginGenerateRemote('some-unknown-plugin')).toBe(true);
      expect(willPluginGenerateRemote('some-unknown-plugin')).toBe(true);
    });

    it('returns true for remote-only plugins even when shouldGenerateRemote is false', () => {
      // rag-poisoning has no local implementation: its action calls the
      // remote API whenever remote generation is not explicitly disabled.
      vi.mocked(neverGenerateRemote).mockReturnValue(false);
      vi.mocked(shouldGenerateRemote).mockReturnValue(false);
      expect(canPluginGenerateRemote('rag-poisoning')).toBe(true);
      expect(willPluginGenerateRemote('rag-poisoning')).toBe(true);
    });

    it('returns false for remote-only plugins when remote generation is explicitly disabled', () => {
      vi.mocked(neverGenerateRemote).mockReturnValue(true);
      vi.mocked(shouldGenerateRemote).mockReturnValue(false);
      expect(willPluginGenerateRemote('rag-poisoning')).toBe(false);
    });

    it('follows the global preference for remote-capable plugins', () => {
      vi.mocked(neverGenerateRemote).mockReturnValue(false);
      vi.mocked(shouldGenerateRemote).mockReturnValue(false);
      expect(willPluginGenerateRemote('prompt-extraction')).toBe(false);

      vi.mocked(shouldGenerateRemote).mockReturnValue(true);
      expect(willPluginGenerateRemote('prompt-extraction')).toBe(true);
    });

    it('returns false for local-only plugins even when remote generation is selected', () => {
      vi.mocked(neverGenerateRemote).mockReturnValue(false);
      vi.mocked(shouldGenerateRemote).mockReturnValue(true);
      expect(canPluginGenerateRemote('intent')).toBe(false);
      expect(willPluginGenerateRemote('intent')).toBe(false);
    });
  });

  describe('Remote generation behavior', () => {
    it('should not use remote generation for dataset-based plugins even when shouldGenerateRemote is true', async () => {
      vi.mocked(shouldGenerateRemote).mockReturnValue(true);

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

    it('should use local generation for all plugins when shouldGenerateRemote is false', async () => {
      vi.mocked(shouldGenerateRemote).mockReturnValue(false);

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
