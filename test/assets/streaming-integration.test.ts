import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Readable } from 'stream';
import { createReadStream } from 'fs';
import { getAssetStore } from '../../src/assets';
import { isGzipped } from '../../src/assets/compression';

// Mock dependencies
jest.mock('../../src/envars', () => ({
  getEnvBool: jest.fn((key: string) => {
    if (key === 'PROMPTFOO_USE_ASSET_STORAGE') return true;
    if (key === 'PROMPTFOO_ASSET_DEDUPLICATION') return false;
    return false;
  }),
  getEnvInt: jest.fn((key, defaultValue) => {
    if (key === 'PROMPTFOO_STREAM_THRESHOLD') return 1024; // 1KB for testing
    return defaultValue;
  }),
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

describe('AssetStore Streaming Integration', () => {
  let tempDir: string;
  let assetStore: any;
  
  const mockGetConfigDirectoryPath = jest.requireMock(
    '../../src/util/config/manage',
  ).getConfigDirectoryPath;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-stream-test-'));
    mockGetConfigDirectoryPath.mockReturnValue(tempDir);
    
    // Clear the module cache to get a fresh instance
    jest.resetModules();
    
    // Re-mock after module reset
    jest.mock('../../src/util/config/manage', () => ({
      getConfigDirectoryPath: jest.fn(() => tempDir),
    }));
    
    jest.mock('../../src/envars', () => ({
      getEnvBool: jest.fn((key: string) => {
        if (key === 'PROMPTFOO_USE_ASSET_STORAGE') return true;
        if (key === 'PROMPTFOO_ASSET_DEDUPLICATION') return false;
        return false;
      }),
      getEnvInt: jest.fn((key, defaultValue) => {
        if (key === 'PROMPTFOO_STREAM_THRESHOLD') return 1024; // 1KB for testing
        return defaultValue;
      }),
    }));
    
    const assetModule = require('../../src/assets');
    assetStore = new assetModule.AssetStore({ baseDir: path.join(tempDir, 'assets') });
    
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('saveStream', () => {
    it('should save large image using streaming', async () => {
      // Create a large image-like data
      const imageData = Buffer.alloc(5 * 1024 * 1024, 'image'); // 5MB
      const stream = Readable.from([imageData]);
      const evalId = 'eval-stream-1';
      const resultId = 'result-1';
      
      const metadata = await assetStore.saveStream(
        stream,
        'image',
        'image/png',
        evalId,
        resultId
      );
      
      expect(metadata.type).toBe('image');
      expect(metadata.mimeType).toBe('image/png');
      expect(metadata.originalSize).toBe(imageData.length);
      expect(metadata.compressed).toBe(false); // Images shouldn't be compressed
      expect(metadata.hash).toBeTruthy();
      
      // Verify file was saved
      const savedPath = path.join(tempDir, 'assets', evalId, resultId, metadata.id);
      const savedData = await fs.readFile(savedPath);
      expect(savedData).toEqual(imageData);
    });

    it('should save text data with compression when using streaming', async () => {
      // Create compressible text data
      const textData = Buffer.from('This is test text data. '.repeat(1000));
      const stream = Readable.from([textData]);
      const evalId = 'eval-stream-2';
      const resultId = 'result-1';
      
      // This would need to be saved as audio with text content to test compression
      // since only audio/image types are currently supported
      const metadata = await assetStore.saveStream(
        stream,
        'audio',
        'audio/wav',
        evalId,
        resultId
      );
      
      expect(metadata.compressed).toBe(false); // Audio files aren't compressed
      expect(metadata.originalSize).toBe(textData.length);
    });

    it('should reject invalid evalId', async () => {
      const stream = Readable.from(['test']);
      
      await expect(
        assetStore.saveStream(stream, 'image', 'image/png', '../evil', 'result-1')
      ).rejects.toThrow('Invalid evalId or resultId format');
    });

    it('should reject invalid MIME type', async () => {
      const stream = Readable.from(['test']);
      
      await expect(
        assetStore.saveStream(stream, 'image', 'text/plain', 'eval-1', 'result-1')
      ).rejects.toThrow('Invalid image MIME type');
    });

    it('should reject oversized assets', async () => {
      // Create data larger than max size
      const largeData = Buffer.alloc(60 * 1024 * 1024); // 60MB (over 50MB default)
      const stream = Readable.from([largeData]);
      
      await expect(
        assetStore.saveStream(stream, 'image', 'image/png', 'eval-1', 'result-1')
      ).rejects.toThrow('Asset too large');
    });

    it('should clean up files on error', async () => {
      // Create a stream that will error
      const stream = new Readable({
        read() {
          this.emit('error', new Error('Stream error'));
        }
      });
      
      const evalId = 'eval-error';
      const resultId = 'result-1';
      
      await expect(
        assetStore.saveStream(stream, 'image', 'image/png', evalId, resultId)
      ).rejects.toThrow();
      
      // Check that no files were left behind
      const dir = path.join(tempDir, 'assets', evalId, resultId);
      try {
        const files = await fs.readdir(dir);
        expect(files.length).toBe(0);
      } catch (error: any) {
        // Directory might not exist, which is also fine
        expect(error.code).toBe('ENOENT');
      }
    });
  });

  describe('loadStream', () => {
    it('should load asset as stream', async () => {
      // First save an asset
      const data = Buffer.from('test data for streaming load');
      const evalId = 'eval-load-1';
      const resultId = 'result-1';
      
      const metadata = await assetStore.save(
        data,
        'image',
        'image/png',
        evalId,
        resultId
      );
      
      // Now load it as a stream
      const stream = assetStore.loadStream(evalId, resultId, metadata.id);
      
      // Collect stream data
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        stream
          .on('data', (chunk) => chunks.push(chunk))
          .on('end', resolve)
          .on('error', reject);
      });
      
      const loadedData = Buffer.concat(chunks);
      expect(loadedData).toEqual(data);
    });

    it('should load compressed asset as stream', async () => {
      // Save a text file that will be compressed
      const textData = Buffer.from('Compressible text data. '.repeat(100));
      const evalId = 'eval-load-2';
      const resultId = 'result-1';
      
      // Save directly with compression by manipulating the file
      const id = 'test-compressed-asset';
      const dir = path.join(tempDir, 'assets', evalId, resultId);
      await fs.mkdir(dir, { recursive: true });
      
      const zlib = require('zlib');
      const compressed = zlib.gzipSync(textData);
      await fs.writeFile(path.join(dir, id), compressed);
      
      const metadata = {
        id,
        type: 'image' as const,
        mimeType: 'image/png',
        size: compressed.length,
        hash: 'test-hash',
        createdAt: Date.now(),
        compressed: true,
        originalSize: textData.length,
      };
      await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify(metadata));
      
      // Load as stream
      const stream = assetStore.loadStream(evalId, resultId, id);
      
      // Collect stream data
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        stream
          .on('data', (chunk) => chunks.push(chunk))
          .on('end', resolve)
          .on('error', reject);
      });
      
      const loadedData = Buffer.concat(chunks);
      expect(loadedData).toEqual(textData);
    });

    it('should handle deduplicated assets', async () => {
      // Create a mock deduplicated asset
      const originalData = Buffer.from('original asset data');
      const origEvalId = 'eval-orig';
      const origResultId = 'result-orig';
      const origAssetId = 'asset-orig';
      
      // Save original
      const origDir = path.join(tempDir, 'assets', origEvalId, origResultId);
      await fs.mkdir(origDir, { recursive: true });
      await fs.writeFile(path.join(origDir, origAssetId), originalData);
      await fs.writeFile(
        path.join(origDir, `${origAssetId}.json`),
        JSON.stringify({
          id: origAssetId,
          type: 'image',
          mimeType: 'image/png',
          size: originalData.length,
          hash: 'test-hash',
          createdAt: Date.now(),
        })
      );
      
      // Create deduplicated reference
      const dedupEvalId = 'eval-dedup';
      const dedupResultId = 'result-dedup';
      const dedupAssetId = 'asset-dedup';
      
      const dedupDir = path.join(tempDir, 'assets', dedupEvalId, dedupResultId);
      await fs.mkdir(dedupDir, { recursive: true });
      await fs.writeFile(
        path.join(dedupDir, `${dedupAssetId}.json`),
        JSON.stringify({
          id: dedupAssetId,
          type: 'image',
          mimeType: 'image/png',
          size: originalData.length,
          hash: 'test-hash',
          createdAt: Date.now(),
          dedupedFrom: `${origEvalId}/${origResultId}/${origAssetId}`,
        })
      );
      
      // Load deduplicated asset as stream
      const stream = assetStore.loadStream(dedupEvalId, dedupResultId, dedupAssetId);
      
      // Collect stream data
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        stream
          .on('data', (chunk) => chunks.push(chunk))
          .on('end', resolve)
          .on('error', reject);
      });
      
      const loadedData = Buffer.concat(chunks);
      expect(loadedData).toEqual(originalData);
    });

    it('should reject invalid IDs', () => {
      expect(() => assetStore.loadStream('../evil', 'result', 'asset')).toThrow(
        'Invalid ID format'
      );
    });

    it('should handle non-existent assets', async () => {
      const stream = assetStore.loadStream('eval-missing', 'result-missing', 'asset-missing');
      
      await expect(
        new Promise((resolve, reject) => {
          stream.on('error', reject).on('end', resolve);
        })
      ).rejects.toThrow();
    });
  });

  describe('saveFromFile', () => {
    it('should use streaming for large files', async () => {
      // Create a file larger than threshold (1KB in test)
      const largeData = Buffer.alloc(2048, 'large');
      const filePath = path.join(tempDir, 'large.png');
      await fs.writeFile(filePath, largeData);
      
      const logger = jest.requireMock('../../src/logger').default;
      
      const metadata = await assetStore.saveFromFile(
        filePath,
        'image',
        'image/png',
        'eval-file-1',
        'result-1'
      );
      
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Using streaming save for large file')
      );
      
      expect(metadata.originalSize).toBe(largeData.length);
    });

    it('should use regular save for small files', async () => {
      // Create a file smaller than threshold (1KB in test)
      const smallData = Buffer.from('small file content');
      const filePath = path.join(tempDir, 'small.png');
      await fs.writeFile(filePath, smallData);
      
      const logger = jest.requireMock('../../src/logger').default;
      logger.debug.mockClear();
      
      const metadata = await assetStore.saveFromFile(
        filePath,
        'image',
        'image/png',
        'eval-file-2',
        'result-1'
      );
      
      // Should not log streaming message
      expect(logger.debug).not.toHaveBeenCalledWith(
        expect.stringContaining('Using streaming save')
      );
      
      expect(metadata.size).toBe(smallData.length);
    });
  });

  describe('getStreamThreshold', () => {
    it('should return configured stream threshold', () => {
      expect(assetStore.getStreamThreshold()).toBe(1024); // 1KB as mocked
    });
  });
});