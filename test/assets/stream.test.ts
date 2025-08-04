import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Readable, Transform } from 'stream';
import {
  createHashStream,
  createSizeCounterStream,
  streamingSave,
  streamingLoad,
  calculateFileHash,
  getFileSize,
  streamCopyWithProgress,
  shouldUseStreaming,
  createChunkedStream,
} from '../../src/assets/stream';

describe('Asset Streaming', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'stream-test-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  describe('createHashStream', () => {
    it('should calculate hash while passing data through', async () => {
      const data = Buffer.from('test data for hashing');
      const hashStream = createHashStream();
      
      // Create a readable stream from the data
      const readable = Readable.from([data]);
      
      // Collect the output
      const chunks: Buffer[] = [];
      hashStream.on('data', (chunk) => chunks.push(chunk));
      
      // Pipe the data through
      await new Promise<void>((resolve, reject) => {
        readable.pipe(hashStream)
          .on('finish', resolve)
          .on('error', reject);
      });
      
      // Check the output matches input
      const output = Buffer.concat(chunks);
      expect(output).toEqual(data);
      
      // Check the hash is calculated correctly
      const expectedHash = require('crypto').createHash('sha256').update(data).digest('hex');
      expect(hashStream.getHash()).toBe(expectedHash);
    });

    it('should throw if hash is requested before stream finishes', () => {
      const hashStream = createHashStream();
      expect(() => hashStream.getHash()).toThrow('Hash not yet calculated');
    });
  });

  describe('createSizeCounterStream', () => {
    it('should count bytes while passing data through', async () => {
      const data1 = Buffer.from('first chunk');
      const data2 = Buffer.from('second chunk');
      const sizeStream = createSizeCounterStream();
      
      const readable = Readable.from([data1, data2]);
      const chunks: Buffer[] = [];
      sizeStream.on('data', (chunk) => chunks.push(chunk));
      
      await new Promise<void>((resolve, reject) => {
        readable.pipe(sizeStream)
          .on('finish', resolve)
          .on('error', reject);
      });
      
      const output = Buffer.concat(chunks);
      expect(output).toEqual(Buffer.concat([data1, data2]));
      expect(sizeStream.getSize()).toBe(data1.length + data2.length);
    });
  });

  describe('streamingSave', () => {
    it('should save data without compression', async () => {
      const data = Buffer.from('test data to save');
      const readable = Readable.from([data]);
      const destPath = path.join(tempDir, 'test-file.bin');
      
      const result = await streamingSave(readable, destPath);
      
      expect(result.compressed).toBe(false);
      expect(result.size).toBe(data.length);
      expect(result.originalSize).toBe(data.length);
      expect(result.hash).toBeTruthy();
      
      // Verify file was saved
      const savedData = await fs.promises.readFile(destPath);
      expect(savedData).toEqual(data);
    });

    it('should save data with compression when beneficial', async () => {
      const data = Buffer.from('This is compressible text. '.repeat(100));
      const readable = Readable.from([data]);
      const destPath = path.join(tempDir, 'test-file.txt');
      
      const result = await streamingSave(readable, destPath, {
        compress: true,
        mimeType: 'text/plain',
      });
      
      expect(result.compressed).toBe(true);
      expect(result.size).toBeLessThan(result.originalSize);
      expect(result.originalSize).toBe(data.length);
      
      // Verify compressed file was saved
      const savedData = await fs.promises.readFile(destPath);
      expect(savedData.length).toBe(result.size);
      
      // Check it's gzipped
      expect(savedData[0]).toBe(0x1f);
      expect(savedData[1]).toBe(0x8b);
    });

    it('should clean up temp file on error', async () => {
      const destPath = path.join(tempDir, 'nonexistent', 'test-file.bin');
      const readable = Readable.from(['test']);
      
      await expect(streamingSave(readable, destPath)).rejects.toThrow();
      
      // Temp file should not exist
      const tempPath = `${destPath}.tmp`;
      await expect(fs.promises.access(tempPath)).rejects.toThrow();
    });
  });

  describe('streamingLoad', () => {
    it('should load uncompressed file', async () => {
      const data = Buffer.from('test data');
      const filePath = path.join(tempDir, 'test.bin');
      await fs.promises.writeFile(filePath, data);
      
      const stream = streamingLoad(filePath, { filePath, compressed: false });
      const chunks: Buffer[] = [];
      
      await new Promise<void>((resolve, reject) => {
        stream
          .on('data', (chunk) => chunks.push(chunk))
          .on('end', resolve)
          .on('error', reject);
      });
      
      const result = Buffer.concat(chunks);
      expect(result).toEqual(data);
    });

    it('should load compressed file', async () => {
      const originalData = Buffer.from('This is test data to compress');
      const compressedData = await require('zlib').gzipSync(originalData);
      const filePath = path.join(tempDir, 'test.gz');
      await fs.promises.writeFile(filePath, compressedData);
      
      const stream = streamingLoad(filePath, { filePath, compressed: true });
      const chunks: Buffer[] = [];
      
      await new Promise<void>((resolve, reject) => {
        stream
          .on('data', (chunk) => chunks.push(chunk))
          .on('end', resolve)
          .on('error', reject);
      });
      
      const result = Buffer.concat(chunks);
      expect(result).toEqual(originalData);
    });

    it('should support range requests', async () => {
      const data = Buffer.from('0123456789abcdef');
      const filePath = path.join(tempDir, 'test.bin');
      await fs.promises.writeFile(filePath, data);
      
      const stream = streamingLoad(filePath, {
        filePath,
        compressed: false,
        start: 5,
        end: 10,
      });
      
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        stream
          .on('data', (chunk) => chunks.push(chunk))
          .on('end', resolve)
          .on('error', reject);
      });
      
      const result = Buffer.concat(chunks);
      expect(result.toString()).toBe('56789a');
    });
  });

  describe('calculateFileHash', () => {
    it('should calculate file hash without loading entire file', async () => {
      const data = Buffer.from('test data for hashing');
      const filePath = path.join(tempDir, 'test.bin');
      await fs.promises.writeFile(filePath, data);
      
      const hash = await calculateFileHash(filePath);
      
      const expectedHash = require('crypto').createHash('sha256').update(data).digest('hex');
      expect(hash).toBe(expectedHash);
    });
  });

  describe('getFileSize', () => {
    it('should get file size without loading it', async () => {
      const data = Buffer.from('test data');
      const filePath = path.join(tempDir, 'test.bin');
      await fs.promises.writeFile(filePath, data);
      
      const size = await getFileSize(filePath);
      expect(size).toBe(data.length);
    });
  });

  describe('streamCopyWithProgress', () => {
    it('should copy file with progress callbacks', async () => {
      const data = Buffer.from('test data for copying');
      const sourcePath = path.join(tempDir, 'source.bin');
      const destPath = path.join(tempDir, 'dest.bin');
      await fs.promises.writeFile(sourcePath, data);
      
      const progressUpdates: Array<{ processed: number; total: number }> = [];
      
      await streamCopyWithProgress(sourcePath, destPath, (processed, total) => {
        progressUpdates.push({ processed, total });
      });
      
      // Verify copy
      const copiedData = await fs.promises.readFile(destPath);
      expect(copiedData).toEqual(data);
      
      // Verify progress was reported
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1]).toEqual({
        processed: data.length,
        total: data.length,
      });
    });
  });

  describe('shouldUseStreaming', () => {
    it('should return true for large files', async () => {
      const largeData = Buffer.alloc(20 * 1024 * 1024); // 20MB
      const filePath = path.join(tempDir, 'large.bin');
      await fs.promises.writeFile(filePath, largeData);
      
      const result = await shouldUseStreaming(filePath, 10 * 1024 * 1024);
      expect(result).toBe(true);
    });

    it('should return false for small files', async () => {
      const smallData = Buffer.from('small file');
      const filePath = path.join(tempDir, 'small.bin');
      await fs.promises.writeFile(filePath, smallData);
      
      const result = await shouldUseStreaming(filePath, 10 * 1024 * 1024);
      expect(result).toBe(false);
    });

    it('should return false for non-existent files', async () => {
      const result = await shouldUseStreaming('/non/existent/file.bin');
      expect(result).toBe(false);
    });
  });

  describe('createChunkedStream', () => {
    it('should split data into chunks', async () => {
      const data = Buffer.from('0123456789abcdefghij'); // 20 bytes
      const chunkSize = 7;
      const chunkedStream = createChunkedStream(chunkSize);
      
      const readable = Readable.from([data]);
      const outputChunks: Buffer[] = [];
      
      chunkedStream.on('data', (chunk) => outputChunks.push(chunk));
      
      await new Promise<void>((resolve, reject) => {
        readable.pipe(chunkedStream)
          .on('finish', resolve)
          .on('error', reject);
      });
      
      // Check chunks
      expect(outputChunks).toHaveLength(3);
      expect(outputChunks[0].length).toBe(7);
      expect(outputChunks[1].length).toBe(7);
      expect(outputChunks[2].length).toBe(6);
      
      // Verify chunks reconstruct to original
      const reconstructed = Buffer.concat(outputChunks);
      expect(reconstructed).toEqual(data);
      
      // Verify getChunks returns same data
      const storedChunks = chunkedStream.getChunks();
      expect(storedChunks).toHaveLength(3);
      expect(Buffer.concat(storedChunks)).toEqual(data);
    });

    it('should handle empty stream', async () => {
      const chunkedStream = createChunkedStream(10);
      const readable = Readable.from([]);
      
      await new Promise<void>((resolve, reject) => {
        readable.pipe(chunkedStream)
          .on('finish', resolve)
          .on('error', reject);
      });
      
      expect(chunkedStream.getChunks()).toHaveLength(0);
    });
  });
});