import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { BeavertailsPlugin } from '../../../src/redteam/plugins/beavertails';
import { CustomPlugin } from '../../../src/redteam/plugins/custom';
import { CyberSecEvalPlugin } from '../../../src/redteam/plugins/cyberseceval';
import { DoNotAnswerPlugin } from '../../../src/redteam/plugins/donotanswer';
import { HarmbenchPlugin } from '../../../src/redteam/plugins/harmbench';
import { Plugins } from '../../../src/redteam/plugins/index';
import { IntentPlugin } from '../../../src/redteam/plugins/intent';
import { PlinyPlugin } from '../../../src/redteam/plugins/pliny';
import { UnsafeBenchPlugin } from '../../../src/redteam/plugins/unsafebench';
import { shouldGenerateRemote } from '../../../src/redteam/remoteGeneration';
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
