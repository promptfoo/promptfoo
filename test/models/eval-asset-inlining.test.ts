import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { getAssetStore } from '../../src/assets';
import type { EvaluateSummaryV3 } from '../../src/types';

jest.mock('../../src/envars', () => ({
  getEnvBool: jest.fn((key: string, defaultValue: boolean) => {
    if (key === 'PROMPTFOO_USE_ASSET_STORAGE') return true;
    if (key === 'PROMPTFOO_ASSET_DEDUPLICATION') return false;
    return defaultValue;
  }),
  getEnvInt: jest.fn((key, defaultValue) => defaultValue),
}));

jest.mock('../../src/util/config/manage', () => ({
  getConfigDirectoryPath: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../src/database', () => ({
  getDb: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    get: jest.fn(),
    all: jest.fn().mockReturnValue([]),
    run: jest.fn(),
  })),
}));

jest.mock('../../src/globalConfig/accounts', () => ({
  getUserEmail: jest.fn(),
}));

describe('Eval Asset Inlining', () => {
  let tempDir: string;
  let assetStore: ReturnType<typeof getAssetStore>;
  
  const mockGetConfigDirectoryPath = jest.requireMock(
    '../../src/util/config/manage',
  ).getConfigDirectoryPath;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-eval-test-'));
    mockGetConfigDirectoryPath.mockReturnValue(tempDir);
    assetStore = getAssetStore();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('toEvaluateSummary with asset storage', () => {
    it('should inline asset URLs when exporting', async () => {
      // Create a test eval
      const evalRecord = new Eval(
        'test-eval-123',
        new Date(),
        {},
        [{ raw: 'test prompt', prompt: 'test prompt', function: 'test', label: 'test' }],
        []
      );

      // Save some test assets
      const imageData = Buffer.from('fake image data');
      const audioData = Buffer.from('fake audio data');
      
      const imageMeta = await assetStore.save(
        imageData, 
        'image', 
        'image/png',
        'test-eval-123',
        'result-001'
      );
      
      const audioMeta = await assetStore.save(
        audioData,
        'audio',
        'audio/wav', 
        'test-eval-123',
        'result-002'
      );

      // Create mock results with asset URLs
      evalRecord.results = [
        new EvalResult(
          'result-001',
          'test-eval-123',
          0,
          0,
          { id: 'provider1' },
          { prompt: 'test prompt' },
          {},
          {
            output: `Here's an image: ![test](promptfoo://test-eval-123/result-001/${imageMeta.id})`,
          },
          null,
          0,
          true,
          1.0,
          100,
          null,
          {},
          {}
        ),
        new EvalResult(
          'result-002',
          'test-eval-123',
          0,
          1,
          { id: 'provider2' },
          { prompt: 'test prompt' },
          {},
          {
            output: `Here's audio: [Audio](promptfoo://test-eval-123/result-002/${audioMeta.id})`,
          },
          null,
          0,
          true,
          1.0,
          100,
          null,
          {},
          {}
        ),
      ];

      // Get the summary (which should inline assets)
      const summary = await evalRecord.toEvaluateSummary() as EvaluateSummaryV3;

      // Verify assets were inlined
      expect(summary.results[0].response?.output).toContain('data:image/png;base64,');
      expect(summary.results[0].response?.output).toContain(imageData.toString('base64'));
      
      expect(summary.results[1].response?.output).toContain('data:audio/wav;base64,');
      expect(summary.results[1].response?.output).toContain(audioData.toString('base64'));
      
      // Verify asset URLs were replaced
      expect(summary.results[0].response?.output).not.toContain('promptfoo://');
      expect(summary.results[1].response?.output).not.toContain('promptfoo://');
    });

    it('should handle missing assets gracefully', async () => {
      const evalRecord = new Eval(
        'test-eval-456',
        new Date(),
        {},
        [{ raw: 'test prompt', prompt: 'test prompt', function: 'test', label: 'test' }],
        []
      );

      // Create result with non-existent asset URL
      evalRecord.results = [
        new EvalResult(
          'result-001',
          'test-eval-456',
          0,
          0,
          { id: 'provider1' },
          { prompt: 'test prompt' },
          {},
          {
            output: `Missing asset: ![test](promptfoo://test-eval-456/result-001/non-existent-asset)`,
          },
          null,
          0,
          true,
          1.0,
          100,
          null,
          {},
          {}
        ),
      ];

      const summary = await evalRecord.toEvaluateSummary() as EvaluateSummaryV3;

      // Should leave the asset URL as-is when it can't be loaded
      expect(summary.results[0].response?.output).toContain('promptfoo://test-eval-456/result-001/non-existent-asset');
    });

    it('should handle multiple asset URLs in one output', async () => {
      const evalRecord = new Eval(
        'test-eval-789',
        new Date(),
        {},
        [{ raw: 'test prompt', prompt: 'test prompt', function: 'test', label: 'test' }],
        []
      );

      // Save multiple assets
      const image1 = Buffer.from('image 1');
      const image2 = Buffer.from('image 2');
      
      const meta1 = await assetStore.save(image1, 'image', 'image/png', 'test-eval-789', 'result-001');
      const meta2 = await assetStore.save(image2, 'image', 'image/jpeg', 'test-eval-789', 'result-001');

      evalRecord.results = [
        new EvalResult(
          'result-001',
          'test-eval-789',
          0,
          0,
          { id: 'provider1' },
          { prompt: 'test prompt' },
          {},
          {
            output: `Two images: ![img1](promptfoo://test-eval-789/result-001/${meta1.id}) and ![img2](promptfoo://test-eval-789/result-001/${meta2.id})`,
          },
          null,
          0,
          true,
          1.0,
          100,
          null,
          {},
          {}
        ),
      ];

      const summary = await evalRecord.toEvaluateSummary() as EvaluateSummaryV3;

      // Both assets should be inlined
      expect(summary.results[0].response?.output).toContain('data:image/png;base64,');
      expect(summary.results[0].response?.output).toContain(image1.toString('base64'));
      expect(summary.results[0].response?.output).toContain('data:image/jpeg;base64,');
      expect(summary.results[0].response?.output).toContain(image2.toString('base64'));
    });
  });
});