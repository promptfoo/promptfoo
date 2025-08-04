import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import archiver from 'archiver';
import { exportAssetBundle } from '../../src/export/assetBundle';

// Mock dependencies
jest.mock('../../src/envars', () => ({
  getEnvBool: jest.fn(() => true),
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

jest.mock('archiver');
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  createWriteStream: jest.fn(),
}));

// Mock database
const mockDb = {
  prepare: jest.fn(),
};

jest.mock('../../src/database', () => ({
  getDb: jest.fn(() => mockDb),
}));

// Mock asset store
const mockAssetStore = {
  load: jest.fn(),
  getMetadata: jest.fn(),
};

jest.mock('../../src/assets', () => ({
  getAssetStore: jest.fn(() => mockAssetStore),
  isAssetStorageEnabled: jest.fn(() => true),
}));

// Mock getExtensionFromMimeType
jest.mock('../../src/util/mimeTypes', () => ({
  getExtensionFromMimeType: jest.fn((mimeType) => {
    const map: Record<string, string> = {
      'image/png': '.png',
      'audio/wav': '.wav',
    };
    return map[mimeType] || '';
  }),
}));

describe('Asset Bundle Export', () => {
  let tempDir: string;
  
  const mockGetConfigDirectoryPath = jest.requireMock(
    '../../src/util/config/manage',
  ).getConfigDirectoryPath;
  
  const setupArchiveMock = () => {
    const mockArchive = {
      append: jest.fn(),
      finalize: jest.fn(),
      pipe: jest.fn().mockReturnThis(),
      on: jest.fn(),
    };
    
    const mockWriteStream = {
      on: jest.fn((event, callback) => {
        if (event === 'close') {
          mockArchive.finalize.mockImplementation(() => {
            process.nextTick(callback);
            return Promise.resolve();
          });
        }
      }),
    };
    
    const mockCreateWriteStream = jest.requireMock('fs').createWriteStream;
    mockCreateWriteStream.mockReturnValue(mockWriteStream);
    (archiver as jest.Mock).mockReturnValue(mockArchive);
    
    return mockArchive;
  };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-bundle-test-'));
    mockGetConfigDirectoryPath.mockReturnValue(tempDir);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should export evaluation with assets', async () => {
    const evalId = 'test-eval-bundle';
    
    // Mock evaluation data
    const evalData = {
      id: evalId,
      created_at: Date.now(),
      author: 'Test User',
      description: 'Test evaluation for bundle export',
      results: JSON.stringify({ summary: 'test results' }),
      config: JSON.stringify({ providers: ['test'] }),
      prompts: JSON.stringify([{ prompt: 'test prompt' }]),
    };
    
    mockDb.prepare.mockImplementation((query: string) => ({
      get: () => query.includes('FROM evals') ? evalData : null,
      all: () => query.includes('FROM eval_results') ? [
        {
          id: 'result-1',
          eval_id: evalId,
          response: JSON.stringify({
            output: `Image: ![test](promptfoo://${evalId}/result-1/asset-1)`,
          }),
        },
        {
          id: 'result-2',
          eval_id: evalId,
          response: JSON.stringify({
            output: `Audio: [Audio](promptfoo://${evalId}/result-2/asset-2)`,
          }),
        },
      ] : [],
    }));
    
    // Mock asset loading
    mockAssetStore.load.mockImplementation(async (evalId, resultId, assetId) => {
      if (assetId === 'asset-1') return Buffer.from('test image data');
      if (assetId === 'asset-2') return Buffer.from('test audio data');
      throw new Error('Asset not found');
    });
    
    mockAssetStore.getMetadata.mockImplementation(async (evalId, resultId, assetId) => {
      if (assetId === 'asset-1') {
        return {
          id: 'asset-1',
          type: 'image',
          mimeType: 'image/png',
          size: 15,
        };
      }
      if (assetId === 'asset-2') {
        return {
          id: 'asset-2',
          type: 'audio',
          mimeType: 'audio/wav',
          size: 15,
        };
      }
      throw new Error('Asset metadata not found');
    });
    
    // Setup archive mock
    const mockArchive = setupArchiveMock();
    
    // Export bundle
    const outputPath = path.join(tempDir, 'test-bundle.zip');
    await exportAssetBundle({
      evalId,
      outputPath,
      includeMetadata: true,
    });
    
    // Verify archive was created correctly
    expect(archiver).toHaveBeenCalledWith('zip', { zlib: { level: 9 } });
    
    // Verify files were added to archive
    const appendCalls = mockArchive.append.mock.calls;
    
    // Should have evaluation.json
    const evalJsonCall = appendCalls.find(call => call[1].name === 'evaluation.json');
    expect(evalJsonCall).toBeTruthy();
    const evalJson = JSON.parse(evalJsonCall[0]);
    expect(evalJson.version).toBe(3);
    expect(evalJson.author).toBe('Test User');
    
    // Should have results.json
    const resultsJsonCall = appendCalls.find(call => call[1].name === 'results.json');
    expect(resultsJsonCall).toBeTruthy();
    
    // Should have manifest.json
    const manifestCall = appendCalls.find(call => call[1].name === 'manifest.json');
    expect(manifestCall).toBeTruthy();
    const manifest = JSON.parse(manifestCall[0]);
    expect(manifest.version).toBe('1.0');
    expect(manifest.assets).toHaveLength(2);
    
    // Verify assets were added
    const assetCalls = appendCalls.filter(call => call[1].name?.startsWith('assets/'));
    expect(assetCalls).toHaveLength(2);
    
    // Check image asset
    const imageAssetCall = assetCalls.find(call => call[1].name.endsWith('.png'));
    expect(imageAssetCall).toBeTruthy();
    expect(imageAssetCall[0].toString()).toBe('test image data');
    
    // Check audio asset
    const audioAssetCall = assetCalls.find(call => call[1].name.endsWith('.wav'));
    expect(audioAssetCall).toBeTruthy();
    expect(audioAssetCall[0].toString()).toBe('test audio data');
    
    expect(mockArchive.finalize).toHaveBeenCalled();
  });

  it('should handle missing assets gracefully', async () => {
    const evalId = 'test-eval-broken';
    
    mockDb.prepare.mockImplementation((query: string) => ({
      get: () => query.includes('FROM evals') ? {
        id: evalId,
        created_at: Date.now(),
        results: JSON.stringify({ summary: 'test' }),
        config: JSON.stringify({}),
      } : null,
      all: () => query.includes('FROM eval_results') ? [
        {
          id: 'result-broken',
          eval_id: evalId,
          response: JSON.stringify({
            output: 'Missing asset: ![test](promptfoo://eval-missing/result-missing/asset-missing)',
          }),
        },
      ] : [],
    }));
    
    // All asset loads fail
    mockAssetStore.load.mockRejectedValue(new Error('Asset not found'));
    mockAssetStore.getMetadata.mockRejectedValue(new Error('Asset metadata not found'));
    
    const mockArchive = setupArchiveMock();
    
    const outputPath = path.join(tempDir, 'broken-bundle.zip');
    await exportAssetBundle({
      evalId,
      outputPath,
      includeMetadata: false,
    });
    
    // Should still create bundle without the missing asset
    const manifestCall = mockArchive.append.mock.calls.find(
      call => call[1].name === 'manifest.json'
    );
    const manifest = JSON.parse(manifestCall[0]);
    expect(manifest.assets).toHaveLength(0); // No assets could be loaded
  });

  it('should throw error for non-existent evaluation', async () => {
    mockDb.prepare.mockImplementation(() => ({
      get: () => null,
      all: () => [],
    }));
    
    await expect(
      exportAssetBundle({
        evalId: 'non-existent-eval',
        outputPath: path.join(tempDir, 'error.zip'),
      })
    ).rejects.toThrow('Evaluation non-existent-eval not found');
  });
});