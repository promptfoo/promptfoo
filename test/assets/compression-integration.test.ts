import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { getAssetStore } from '../../src/assets';
import { isGzipped } from '../../src/assets/compression';

// Mock dependencies
jest.mock('../../src/envars', () => ({
  getEnvBool: jest.fn((key: string) => {
    if (key === 'PROMPTFOO_USE_ASSET_STORAGE') return true;
    if (key === 'PROMPTFOO_ASSET_DEDUPLICATION') return false;
    return false;
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

describe('Asset Compression Integration', () => {
  let tempDir: string;
  let assetStore: any;
  
  const mockGetConfigDirectoryPath = jest.requireMock(
    '../../src/util/config/manage',
  ).getConfigDirectoryPath;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-compression-test-'));
    mockGetConfigDirectoryPath.mockReturnValue(tempDir);
    
    // Reset the singleton
    jest.resetModules();
    const assetModule = require('../../src/assets');
    assetStore = new assetModule.AssetStore({ baseDir: path.join(tempDir, 'assets') });
    
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should not compress image data even if it contains text', async () => {
    // Even if image data is actually text, it shouldn't be compressed
    // because image MIME types are not compressible
    const textData = 'This is actually text data '.repeat(100);
    const data = Buffer.from(textData);
    const evalId = 'eval-no-compress-image';
    const resultId = 'result-1';
    
    const metadata = await assetStore.save(
      data,
      'image',
      'image/png',
      evalId,
      resultId
    );
    
    // Should not be compressed because it's marked as image/png
    expect(metadata.compressed).toBeFalsy();
    expect(metadata.size).toBe(data.length);
    
    // Verify round trip still works
    const loaded = await assetStore.load(evalId, resultId, metadata.id);
    expect(loaded.toString()).toBe(textData);
  });

  it('should not compress actual binary image data', async () => {
    // Create fake binary data
    const imageData = Buffer.from(
      Array.from({ length: 2000 }, () => Math.floor(Math.random() * 256))
    );
    const evalId = 'eval-no-compress';
    const resultId = 'result-1';
    
    const metadata = await assetStore.save(
      imageData,
      'image',
      'image/png',
      evalId,
      resultId
    );
    
    // Should not be compressed
    expect(metadata.compressed).toBeFalsy();
    expect(metadata.size).toBe(imageData.length);
    
    // Verify stored file is not compressed
    const storedPath = path.join(tempDir, 'assets', evalId, resultId, metadata.id);
    const storedData = await fs.readFile(storedPath);
    expect(isGzipped(storedData)).toBe(false);
  });

  it('should not compress audio files', async () => {
    // Audio files are typically already compressed
    const audioData = Buffer.from(
      Array.from({ length: 2000 }, () => Math.floor(Math.random() * 256))
    );
    const evalId = 'eval-audio';
    const resultId = 'result-1';
    
    const metadata = await assetStore.save(
      audioData,
      'audio',
      'audio/mp3',
      evalId,
      resultId
    );
    
    expect(metadata.compressed).toBeFalsy();
    expect(metadata.size).toBe(audioData.length);
  });

  it('should include compression fields in metadata even when not compressed', async () => {
    const data = Buffer.from('Small image');
    const evalId = 'eval-meta';
    const resultId = 'result-1';
    
    const metadata = await assetStore.save(
      data,
      'image',
      'image/png',
      evalId,
      resultId
    );
    
    // Read the metadata file directly
    const metaPath = path.join(tempDir, 'assets', evalId, resultId, `${metadata.id}.json`);
    const metaContent = await fs.readFile(metaPath, 'utf-8');
    const savedMeta = JSON.parse(metaContent);
    
    // Compression fields should exist even if not compressed
    expect(savedMeta.compressed).toBe(false);
    expect(savedMeta.originalSize).toBe(data.length);
  });
});